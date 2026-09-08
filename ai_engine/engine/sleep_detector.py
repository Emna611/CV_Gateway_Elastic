"""Détection de fatigue et d'endormissement par estimation de pose.

Portage de Office_Monitoring_v2/sleep_detector.py. La logique géométrique est
conservée telle quelle — elle est éprouvée — mais les délais de confirmation
deviennent paramétrables (config.yaml) et l'état renvoyé utilise le vocabulaire
du projet : ACTIVE, FATIGUE, SLEEPING.
"""

import math

# Indices des points clés COCO utilisés par yolo11m-pose.
NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHOULDER, R_SHOULDER = 5, 6
L_WRIST, R_WRIST = 9, 10

KEYPOINT_CONFIDENCE = 0.3


def _distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _head_tilt_angle(nose, left_shoulder, right_shoulder):
    mid_x = (left_shoulder[0] + right_shoulder[0]) / 2
    mid_y = (left_shoulder[1] + right_shoulder[1]) / 2
    return abs(math.degrees(math.atan2(nose[0] - mid_x, -(nose[1] - mid_y))))


class SleepDetector:
    """Qualifie l'état d'une personne suivie image après image."""

    HEAD_TILT_ANGLE_THRESHOLD = 45

    def __init__(self, sleep_confirmation=300.0, fatigue_confirmation=30.0):
        self.sleep_confirmation = sleep_confirmation
        self.fatigue_confirmation = fatigue_confirmation

        self.previous_positions = {}
        self.sleep_timers = {}
        self.fatigue_timers = {}

    def forget(self, track_id):
        self.previous_positions.pop(track_id, None)
        self.sleep_timers.pop(track_id, None)
        self.fatigue_timers.pop(track_id, None)

    def analyze(self, track_id, box, keypoints, now):
        """Renvoie (état, confirmé, motif, en_mouvement).

        « confirmé » distingue un signe passager d'un état maintenu au-delà du
        délai configuré : seul un état confirmé doit lever une alerte.
        """
        if keypoints is None or len(keypoints) <= R_WRIST:
            return 'ACTIVE', False, '', True

        nose = keypoints[NOSE]
        l_shoulder, r_shoulder = keypoints[L_SHOULDER], keypoints[R_SHOULDER]
        l_wrist, r_wrist = keypoints[L_WRIST], keypoints[R_WRIST]

        x1, y1, x2, y2 = box
        width = x2 - x1
        height = y2 - y1

        # Une personne debout (boîte plus haute que large) n'est pas assise à un
        # poste : la détection de sommeil ne s'y applique pas.
        if height / (width + 1e-5) > 1.3:
            self.previous_positions.pop(track_id, None)
            return 'ACTIVE', False, '', True

        moving = self._detect_movement(track_id, nose, l_wrist, r_wrist, width)
        if moving:
            self.sleep_timers.pop(track_id, None)
            self.fatigue_timers.pop(track_id, None)
            return 'ACTIVE', False, '', True

        state, reason = self._posture(nose, l_shoulder, r_shoulder, keypoints, l_wrist, r_wrist, width)

        if state == 'SLEEPING':
            self.fatigue_timers.pop(track_id, None)
            started = self.sleep_timers.setdefault(track_id, now)
            elapsed = now - started
            confirmed = elapsed >= self.sleep_confirmation
            return 'SLEEPING', confirmed, f'{reason} ({int(elapsed)}s)', False

        self.sleep_timers.pop(track_id, None)

        if state == 'FATIGUE':
            started = self.fatigue_timers.setdefault(track_id, now)
            elapsed = now - started
            confirmed = elapsed >= self.fatigue_confirmation
            return 'FATIGUE', confirmed, f'{reason} ({int(elapsed)}s)', False

        self.fatigue_timers.pop(track_id, None)
        return 'ACTIVE', False, '', False

    def _detect_movement(self, track_id, nose, l_wrist, r_wrist, width):
        """Mouvement du nez ou des poignets, relatif à la taille de la personne."""
        current = {}
        if nose[2] > KEYPOINT_CONFIDENCE:
            current['nose'] = (float(nose[0]), float(nose[1]))
        if l_wrist[2] > KEYPOINT_CONFIDENCE:
            current['l_wrist'] = (float(l_wrist[0]), float(l_wrist[1]))
        if r_wrist[2] > KEYPOINT_CONFIDENCE:
            current['r_wrist'] = (float(r_wrist[0]), float(r_wrist[1]))

        previous = self.previous_positions.get(track_id, {})
        self.previous_positions[track_id] = current

        nose_threshold = width * 0.05
        wrist_threshold = width * 0.08

        if 'nose' in current and 'nose' in previous:
            if _distance(current['nose'], previous['nose']) > nose_threshold:
                return True
        for key in ('l_wrist', 'r_wrist'):
            if key in current and key in previous:
                if _distance(current[key], previous[key]) > wrist_threshold:
                    return True
        return False

    def _posture(self, nose, l_shoulder, r_shoulder, keypoints, l_wrist, r_wrist, width):
        visible = (
            nose[2] > KEYPOINT_CONFIDENCE
            and l_shoulder[2] > KEYPOINT_CONFIDENCE
            and r_shoulder[2] > KEYPOINT_CONFIDENCE
        )

        if visible:
            shoulder_y = (l_shoulder[1] + r_shoulder[1]) / 2

            # Tête tombée au niveau des épaules : posée sur le bureau.
            if nose[1] > shoulder_y - 10:
                return 'SLEEPING', 'tête sur la table'

            if _head_tilt_angle(nose, l_shoulder, r_shoulder) > self.HEAD_TILT_ANGLE_THRESHOLD:
                return 'SLEEPING', 'tête penchée'

            shoulder_width = _distance(l_shoulder, r_shoulder)
            if shoulder_width > 20 and (shoulder_y - nose[1]) / shoulder_width < 0.45:
                return 'SLEEPING', 'tête basculée en arrière'

        # Main sur la tête : signe de fatigue.
        if nose[2] > KEYPOINT_CONFIDENCE:
            head_points = [
                keypoints[index]
                for index in (L_EYE, R_EYE, L_EAR, R_EAR)
                if keypoints[index][2] > KEYPOINT_CONFIDENCE
            ]
            reach = width * 0.35
            for wrist in (l_wrist, r_wrist):
                if wrist[2] <= KEYPOINT_CONFIDENCE or wrist[1] >= nose[1] + 15:
                    continue
                if any(_distance(wrist, point) < reach for point in head_points):
                    return 'FATIGUE', 'main sur la tête'

        return 'ACTIVE', ''
