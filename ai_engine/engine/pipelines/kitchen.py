"""Scénario cuisine : conformité aux équipements de protection.

Portage de PPE_Restaurant/detector.py. Les seuils par classe et la fenêtre de
conformité viennent de config.yaml, et chaque équipement est activable
séparément. Nouveauté par rapport au prototype : un manquement doit persister
au-delà du seuil configuré avant de lever une alerte, au lieu d'alerter à
chaque image.
"""

import time
from collections import deque

import cv2

# Classe d'équipement portée par chaque détection du modèle.
CATEGORY_OF = {
    'apron': 'apron',
    'no_apron': 'apron',
    'glove': 'glove',
    'no_glove': 'glove',
    'hairnet': 'hairnet',
    'no_hairnet': 'hairnet',
}

# Classe de détection activable -> catégorie et seuil associé.
DETECTION_CATEGORY = {'glove': 'glove', 'hairnet': 'hairnet', 'apron': 'apron'}
THRESHOLD_OF = {'glove': 'no_glove', 'hairnet': 'no_hairnet', 'apron': 'no_apron'}
LABELS = {'glove': 'Gants', 'hairnet': 'Charlotte', 'apron': 'Tablier'}
SEVERITY = {'glove': 'critical', 'hairnet': 'critical', 'apron': 'high'}

COLORS = {'apron': (106, 210, 0), 'glove': (2, 165, 250), 'hairnet': (250, 66, 55)}


class KitchenPipeline:
    def __init__(self, models, zones, thresholds, confidence, detections, inference):
        self.model = models['bestfinal.pt']
        self.thresholds = thresholds
        self.confidence = confidence
        self.detections = set(detections)

        self.class_names = inference.get('classes', [])
        self.per_class = inference.get('per_class_confidence', {})
        self.min_box_area = int(inference.get('min_box_area', 2500))
        self.frame_skip = max(int(inference.get('frame_skip', 2)), 1)
        self.imgsz = int(inference.get('imgsz', 640))

        self.categories = [
            DETECTION_CATEGORY[key] for key in self.detections if key in DETECTION_CATEGORY
        ]
        self.track_compliance = 'compliance' in self.detections
        self.window = float(thresholds.get('ppe_compliant', 5))

        self.history = {category: deque(maxlen=300) for category in DETECTION_CATEGORY.values()}
        self._missing_since = {}
        self._alerted = set()

        self.frame_count = 0
        self.last_boxes = []
        self.events = []

    # ── boucle principale ──

    def process(self, frame, now=None):
        now = now or time.time()
        self.frame_count += 1

        if self.frame_count % self.frame_skip == 0:
            self._infer(frame, now)

        self._evaluate(now)
        return self._annotate(frame)

    def _infer(self, frame, now):
        results = self.model.predict(
            source=frame, conf=self.confidence, imgsz=self.imgsz, verbose=False
        )
        if not results:
            return

        boxes = results[0].boxes
        detected = []
        if boxes is not None:
            for box in boxes:
                class_id = int(box.cls[0])
                if class_id >= len(self.class_names):
                    continue
                name = self.class_names[class_id]
                category = CATEGORY_OF.get(name)
                if category is None or category not in self.categories:
                    continue

                score = float(box.conf[0])
                if score < self.per_class.get(name, self.confidence):
                    continue

                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                if (x2 - x1) * (y2 - y1) < self.min_box_area:
                    continue

                positive = not name.startswith('no_')
                self.history[category].append((now, positive))
                if positive:
                    detected.append((x1, y1, x2, y2, category, score))

        self.last_boxes = detected

    def _evaluate(self, now):
        """Un manquement doit durer plus que son seuil pour devenir une alerte."""
        for category in self.categories:
            compliant = self._is_compliant(category, now)

            if compliant:
                self._missing_since.pop(category, None)
                self._alerted.discard(category)
                continue

            since = self._missing_since.setdefault(category, now)
            threshold = self.thresholds.get(THRESHOLD_OF[category], 5)
            if now - since >= threshold and category not in self._alerted:
                self._alerted.add(category)
                self.events.append(
                    {
                        'type': f'NO_{category.upper()}',
                        'severity': SEVERITY[category],
                        'zone_name': None,
                        'duration': round(now - since, 1),
                        'at': now,
                    }
                )

    def _is_compliant(self, category, now):
        """Conforme si une détection positive est vue dans la fenêtre."""
        return any(
            positive and now - stamp <= self.window
            for stamp, positive in self.history[category]
        )

    # ── rendu ──

    def _annotate(self, frame):
        for x1, y1, x2, y2, category, score in self.last_boxes:
            color = COLORS.get(category, (255, 255, 255))
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame, f'{LABELS[category]} {score:.0%}', (x1, max(y1 - 6, 14)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA
            )

        now = time.time()
        statuses = {category: self._is_compliant(category, now) for category in self.categories}
        total = max(len(self.categories), 1)
        ok = sum(1 for value in statuses.values() if value)
        compliant = bool(statuses) and ok == total
        banner = (80, 180, 0) if compliant else (38, 38, 220)
        text = f'CONFORME {ok}/{total}' if compliant else f'NON CONFORME {ok}/{total}'
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 30), banner, -1)
        cv2.putText(
            frame, text, (10, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA
        )
        return frame

    # ── restitution ──

    def stats(self):
        now = time.time()
        equipment = []
        for category in self.categories:
            compliant = self._is_compliant(category, now)
            missing_since = self._missing_since.get(category)
            equipment.append(
                {
                    'id': category,
                    'name': LABELS[category],
                    'compliant': compliant,
                    'severity': SEVERITY[category],
                    'missing_seconds': round(now - missing_since, 1) if missing_since else 0.0,
                }
            )

        return {
            'kind': 'cuisine',
            'equipment': equipment,
            'compliant': bool(equipment) and all(item['compliant'] for item in equipment),
            'tracks_compliance': self.track_compliance,
        }

    def drain_events(self):
        events, self.events = self.events, []
        return events

    def close_open_occupations(self, now=None):
        return

    def apply_detections(self, detections, models=None):
        self.detections = set(detections)
        self.categories = [
            DETECTION_CATEGORY[key] for key in detections if key in DETECTION_CATEGORY
        ]
        self.track_compliance = 'compliance' in self.detections
        self._alerted &= set(self.categories)
        stale = [category for category in self._missing_since if category not in self.categories]
        for category in stale:
            self._missing_since.pop(category, None)
