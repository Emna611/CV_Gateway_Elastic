"""Scénario bureau : occupation des postes, vigilance, usage du téléphone.

Portage de Office_Monitoring_v2/main.py. Deux différences de fond :
les polygones arrivent normalisés 0..1 et sont convertis en pixels à chaque
image (donc indépendants de la résolution), et chaque classe de détection est
activable séparément.
"""

import time

import cv2
import numpy as np

from ..sleep_detector import L_HIP, L_SHOULDER, R_HIP, R_SHOULDER, SleepDetector

# Fraction minimale de la boîte personne qui doit tomber dans le polygone.
ZONE_OVERLAP_MIN = 0.22
# Points du corps visibles pour compter comme une personne (pas une chaise vide).
PERSON_KEYPOINTS_MIN = 4
PERSON_KEYPOINT_CONF = 0.25

# Une alerte plus grave écrase une alerte plus faible sur la même zone.
PRIORITY = {'SLEEPING': 3, 'FATIGUE': 2, 'ON_PHONE': 1, 'IDLE': 0, 'ACTIVE': 0, 'STANDING': 0}

STATE_COLORS = {
    'ACTIVE': (99, 190, 74),
    'IDLE': (150, 150, 150),
    'STANDING': (180, 120, 180),
    'ON_PHONE': (6, 165, 217),
    'FATIGUE': (6, 119, 217),
    'SLEEPING': (38, 38, 220),
}

SEVERITY = {
    'SLEEPING': 'critical',
    'FATIGUE': 'high',
    'ON_PHONE': 'moderate',
    'IDLE': 'info',
    'ZONE_OCCUPIED': 'info',
}


class OfficePipeline:
    def __init__(self, models, zones, thresholds, confidence, detections, inference):
        self.pose = models['yolo11m-pose.pt']
        self.phone = models.get('phone_model.pt')

        self.zones = zones
        self.thresholds = thresholds
        self.confidence = confidence
        self.detections = set(detections)
        self.imgsz = int(inference.get('imgsz', 1280))
        self.iou = float(inference.get('iou', 0.5))
        self.motion_ratio = float(inference.get('motion_ratio', 0.04))
        self.phone_confidence = float(inference.get('phone_confidence', 0.88))

        self.track_zones = 'zone' in self.detections
        self.track_vigilance = 'vigilance' in self.detections
        self.track_phone = 'phone' in self.detections and self.phone is not None

        self.sleep_detector = SleepDetector(
            sleep_confirmation=thresholds.get('sleeping', 300),
            fatigue_confirmation=thresholds.get('fatigue', 30),
        )

        # État par zone, indexé par identifiant de zone.
        self.zone_state = {
            zone['id']: {
                'id': zone['id'],
                'name': zone['name'],
                'occupied': False,
                'activity_state': 'IDLE',
                'occupants': [],
                'alert': 'ACTIVE',
                'has_laptop': False,
                'occupied_seconds': 0.0,
                'sleep_seconds': 0.0,
                'phone_seconds': 0.0,
                'entered_at': None,
            }
            for zone in zones
        }
        self._present_since = {}
        self._last_tick = {}

        # Suivi du mouvement par personne, pour ACTIVE / IDLE.
        self._last_center = {}
        self._last_motion_at = {}
        self._phone_since = {}
        self._last_people = 0

        self.events = []

    # ── boucle principale ──

    def process(self, frame, now=None):
        now = now or time.time()
        height, width = frame.shape[:2]

        people = self._track_people(frame, now)
        phone_boxes = self._detect_phones(frame)

        assignments = self._locate(people, width, height)
        self._qualify_activity(people, assignments)

        for person in people:
            if self.track_phone and person['state'] == 'ACTIVE':
                self._apply_phone(person, phone_boxes, now)

        self._last_people = len(people)
        self._update_zones(assignments, now, width, height)
        return self._annotate(frame, people, width, height)

    def _apply_phone(self, person, phone_boxes, now):
        """Le téléphone ne lève l'alerte qu'après le seuil configuré."""
        track_id = person['id']
        if not self._overlaps_phone(person['box'], phone_boxes):
            self._phone_since.pop(track_id, None)
            return
        started = self._phone_since.setdefault(track_id, now)
        person['state'] = 'ON_PHONE'
        person['confirmed'] = (now - started) >= self.thresholds.get('on_phone', 5)

    def _track_people(self, frame, now):
        results = self.pose.track(
            frame,
            conf=self.confidence,
            iou=self.iou,
            classes=[0],
            persist=True,
            verbose=False,
            imgsz=self.imgsz,
        )

        people = []
        for result in results:
            if result.boxes is None or result.boxes.id is None:
                continue
            track_ids = result.boxes.id.int().tolist()
            boxes = result.boxes.xyxy.cpu().numpy()

            for index, track_id in enumerate(track_ids):
                box = boxes[index]
                keypoints = None
                if result.keypoints is not None and len(result.keypoints.data) > index:
                    keypoints = result.keypoints.data[index].cpu().numpy()

                state, confirmed, reason, moving = 'IDLE', False, '', False
                if self.track_vigilance:
                    state, confirmed, reason, moving = self.sleep_detector.analyze(
                        track_id, box, keypoints, now
                    )
                else:
                    moving = self._moved(track_id, box)

                if self.track_vigilance:
                    # Le mouvement sert aussi à qualifier ACTIVE / IDLE.
                    self._moved(track_id, box, moving_hint=moving)

                people.append(
                    {
                        'id': int(track_id),
                        'box': box,
                        'keypoints': keypoints,
                        'state': state,
                        'confirmed': confirmed,
                        'reason': reason,
                        'idle': self._is_idle(track_id, now),
                    }
                )
        return people

    def _moved(self, track_id, box, moving_hint=None):
        center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        width = max(box[2] - box[0], 1)
        previous = self._last_center.get(track_id)
        self._last_center[track_id] = center

        moved = moving_hint
        if moved is None:
            moved = (
                previous is not None
                and np.hypot(center[0] - previous[0], center[1] - previous[1])
                > width * self.motion_ratio
            )
        if moved or previous is None:
            self._last_motion_at[track_id] = time.time()
        return bool(moved)

    def _is_idle(self, track_id, now):
        last = self._last_motion_at.get(track_id)
        if last is None:
            return False
        return (now - last) >= self.thresholds.get('idle', 60)

    def _detect_phones(self, frame):
        if not self.track_phone:
            return []
        result = self.phone(frame, conf=self.phone_confidence, verbose=False)[0]
        boxes = []
        for box in result.boxes:
            class_id = int(box.cls[0])
            # Modèle COCO : téléphone = 67. Modèle dédié à une classe : 0.
            if class_id == 67 or (class_id == 0 and len(self.phone.names) == 1):
                boxes.append(box.xyxy[0].cpu().numpy())
        return boxes

    @staticmethod
    def _overlaps_phone(person_box, phone_boxes):
        for phone_box in phone_boxes:
            x1 = max(person_box[0], phone_box[0])
            y1 = max(person_box[1], phone_box[1])
            x2 = min(person_box[2], phone_box[2])
            y2 = min(person_box[3], phone_box[3])
            intersection = max(0, x2 - x1) * max(0, y2 - y1)
            phone_area = (phone_box[2] - phone_box[0]) * (phone_box[3] - phone_box[1])
            person_area = (person_box[2] - person_box[0]) * (person_box[3] - person_box[1])
            if phone_area <= 0 or person_area <= 0:
                continue
            if intersection / phone_area > 0.5 or intersection / person_area > 0.5:
                return True
        return False

    # ── zones ──

    def polygon_pixels(self, zone, width, height):
        """Conversion 0..1 vers pixels, refaite à chaque image."""
        return np.array(
            [[int(x * width), int(y * height)] for x, y in zone['polygon']], dtype=np.int32
        )

    @staticmethod
    def _is_real_person(keypoints):
        """Une chaise ou un manteau n'a pas d'épaules / hanches visibles."""
        if keypoints is None or len(keypoints) <= R_HIP:
            return False
        visible = sum(
            1 for point in keypoints[: R_HIP + 1] if float(point[2]) >= PERSON_KEYPOINT_CONF
        )
        return visible >= PERSON_KEYPOINTS_MIN

    @staticmethod
    def _overlap_ratio(box, polygon):
        x1, y1, x2, y2 = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
        if x2 <= x1 or y2 <= y1:
            return 0.0
        xs = np.linspace(x1, x2, 5)
        ys = np.linspace(y1, y2, 5)
        hits = 0
        total = 0
        for x in xs:
            for y in ys:
                total += 1
                if cv2.pointPolygonTest(polygon, (float(x), float(y)), False) >= 0:
                    hits += 1
        return hits / total if total else 0.0

    @staticmethod
    def _torso_in_polygon(box, keypoints, polygon):
        """Le buste (épaules / hanches), pas les pieds dans l'allée."""
        anchors = []
        if keypoints is not None and len(keypoints) > R_HIP:
            pairs = ((L_SHOULDER, R_SHOULDER), (L_HIP, R_HIP))
            for left, right in pairs:
                a, b = keypoints[left], keypoints[right]
                if float(a[2]) >= PERSON_KEYPOINT_CONF and float(b[2]) >= PERSON_KEYPOINT_CONF:
                    anchors.append(((float(a[0]) + float(b[0])) / 2, (float(a[1]) + float(b[1])) / 2))
        if not anchors:
            x1, y1, x2, y2 = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
            anchors.append(((x1 + x2) / 2, y1 + (y2 - y1) * 0.45))
        return any(
            cv2.pointPolygonTest(polygon, (px, py), False) >= 0 for px, py in anchors
        )

    def _locate(self, people, width, height):
        """Une cabine n'est occupée que si une personne réelle a le buste dedans."""
        assignments = {zone['id']: [] for zone in self.zones}

        if not self.track_zones:
            return assignments

        polygons = {
            zone['id']: self.polygon_pixels(zone, width, height) for zone in self.zones
        }

        for person in people:
            if not self._is_real_person(person.get('keypoints')):
                continue
            box = person['box']
            keypoints = person.get('keypoints')
            best_id = None
            best_score = 0.0
            for zone in self.zones:
                polygon = polygons[zone['id']]
                if not self._torso_in_polygon(box, keypoints, polygon):
                    continue
                score = self._overlap_ratio(box, polygon)
                if score > best_score:
                    best_score = score
                    best_id = zone['id']
            if best_id is not None and best_score >= ZONE_OVERLAP_MIN:
                assignments[best_id].append(person)

        return assignments

    def _qualify_activity(self, people, assignments):
        """Personne dans la zone → ACTIVE. Personne hors zone → IDLE."""
        in_zone = {person['id'] for occupants in assignments.values() for person in occupants}

        for person in people:
            if person['id'] not in in_zone:
                person['state'] = 'IDLE'
                person['idle'] = True
                person['reason'] = ''
                person['confirmed'] = False
                continue

            person['idle'] = False
            if person['state'] in ('SLEEPING', 'FATIGUE'):
                continue
            person['state'] = 'ACTIVE'

    def _update_zones(self, assignments, now, width, height):
        if not self.track_zones:
            return

        confirm_delay = self.thresholds.get('zone_occupied', 3)

        for zone in self.zones:
            zone_id = zone['id']
            state = self.zone_state[zone_id]
            occupants = assignments[zone_id]

            if occupants:
                since = self._present_since.setdefault(zone_id, now)
                occupied = (now - since) >= confirm_delay
            else:
                self._present_since.pop(zone_id, None)
                occupied = False

            elapsed = now - self._last_tick.get(zone_id, now)
            self._last_tick[zone_id] = now

            activity = 'ACTIVE' if occupied else 'IDLE'
            alert = activity
            for person in occupants:
                candidate = person['state']
                if not person['confirmed'] and candidate in ('SLEEPING', 'FATIGUE', 'ON_PHONE'):
                    candidate = activity
                if PRIORITY.get(candidate, 0) > PRIORITY.get(alert, 0):
                    alert = candidate

            if occupied:
                if not state['occupied']:
                    state['entered_at'] = now
                    self._emit_occupation('enter', zone, activity, entered_at=now)
                elif activity != state['activity_state']:
                    duration = now - (state['entered_at'] or now)
                    self._emit_occupation(
                        'exit',
                        zone,
                        state['activity_state'],
                        entered_at=state['entered_at'],
                        exited_at=now,
                        duration_seconds=duration,
                    )
                    state['entered_at'] = now
                    self._emit_occupation('enter', zone, activity, entered_at=now)
                state['occupied_seconds'] += elapsed
            elif state['occupied']:
                duration = now - (state['entered_at'] or now)
                self._emit_occupation(
                    'exit',
                    zone,
                    state['activity_state'],
                    entered_at=state['entered_at'],
                    exited_at=now,
                    duration_seconds=duration,
                )
                state['entered_at'] = None

            if occupied and alert == 'SLEEPING':
                state['sleep_seconds'] += elapsed
            if occupied and alert == 'ON_PHONE':
                state['phone_seconds'] += elapsed

            if occupied and alert != state['alert'] and alert not in ('ACTIVE', 'IDLE'):
                self._emit(alert, zone, occupants)

            state['occupied'] = occupied
            state['activity_state'] = activity if occupied else 'IDLE'
            state['occupants'] = [person['id'] for person in occupants] if occupied else []
            state['alert'] = alert if occupied else 'IDLE'
            state['has_laptop'] = False

    def _emit(self, alert_type, zone, occupants):
        self.events.append(
            {
                'type': alert_type,
                'severity': SEVERITY.get(alert_type, 'info'),
                'zone_id': zone['id'],
                'zone_name': zone['name'],
                'occupants': [person['id'] for person in occupants],
                'at': time.time(),
            }
        )

    def _emit_occupation(
        self,
        action,
        zone,
        activity_state,
        entered_at=None,
        exited_at=None,
        duration_seconds=None,
    ):
        self.events.append(
            {
                'kind': 'occupation',
                'action': action,
                'zone_id': zone['id'],
                'zone_name': zone['name'],
                'activity_state': activity_state,
                'entered_at': entered_at,
                'exited_at': exited_at,
                'duration_seconds': None if duration_seconds is None else round(duration_seconds, 1),
                'at': time.time(),
            }
        )

    def close_open_occupations(self, now=None):
        """Clôture les postes encore occupés à l'arrêt de la session."""
        now = now or time.time()
        for zone in self.zones:
            state = self.zone_state[zone['id']]
            if not state['occupied']:
                continue
            duration = now - (state['entered_at'] or now)
            self._emit_occupation(
                'exit',
                zone,
                state['activity_state'],
                entered_at=state['entered_at'],
                exited_at=now,
                duration_seconds=duration,
            )
            state['occupied'] = False
            state['entered_at'] = None

    # ── rendu ──

    def _annotate(self, frame, people, width, height):
        if self.track_zones:
            for zone in self.zones:
                state = self.zone_state[zone['id']]
                color_key = 'IDLE'
                if state['occupied']:
                    color_key = (
                        state['alert']
                        if state['alert'] in ('SLEEPING', 'FATIGUE', 'ON_PHONE')
                        else state['activity_state']
                    )
                color = STATE_COLORS.get(color_key, (150, 150, 150))
                polygon = self.polygon_pixels(zone, width, height)
                overlay = frame.copy()
                cv2.fillPoly(overlay, [polygon], color)
                cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)
                cv2.polylines(frame, [polygon], True, color, 2)

                anchor = polygon.min(axis=0)
                label = f"{zone['name']} · {state['activity_state'] if state['occupied'] else 'LIBRE'}"
                cv2.putText(
                    frame, label, (int(anchor[0]), max(int(anchor[1]) - 8, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA
                )

        for person in people:
            box = person['box'].astype(int)
            color = STATE_COLORS.get(person['state'], (99, 190, 74))
            cv2.rectangle(frame, (box[0], box[1]), (box[2], box[3]), color, 2)
            label_state = 'DEBOUT' if person['state'] == 'STANDING' else person['state']
            label = f"#{person['id']} {label_state}"
            if person['reason']:
                label += f" · {person['reason']}"
            cv2.putText(
                frame, label, (box[0], max(box[1] - 6, 14)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA
            )

        return frame

    # ── restitution ──

    def stats(self):
        occupied = sum(1 for state in self.zone_state.values() if state['occupied'])
        return {
            'kind': 'bureau',
            'people': self._last_people,
            'occupied': occupied if self.track_zones else 0,
            'zones': [dict(state) for state in self.zone_state.values()] if self.track_zones else [],
        }

    def drain_events(self):
        events, self.events = self.events, []
        return events

    def apply_detections(self, detections, models=None):
        if models and models.get('phone_model.pt'):
            self.phone = models['phone_model.pt']
        self.detections = set(detections)
        was_zones = self.track_zones
        self.track_zones = 'zone' in self.detections
        self.track_vigilance = 'vigilance' in self.detections
        self.track_phone = 'phone' in self.detections and self.phone is not None
        if was_zones and not self.track_zones:
            self.close_open_occupations()
            for state in self.zone_state.values():
                state['occupied'] = False
                state['occupants'] = []
                state['alert'] = 'ACTIVE'
                state['activity_state'] = 'IDLE'
                state['has_laptop'] = False
        if not self.track_phone:
            self._phone_since.clear()
