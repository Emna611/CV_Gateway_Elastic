"""Cycle de vie du moteur : démarrage étape par étape, boucle, arrêt.

Le démarrage rend la main immédiatement et progresse dans un thread : chaque
étape passe à « ok » ou « failed » au moment où elle aboutit réellement, ce que
le client suit par sondage. Aucune étape n'est marquée réussie par avance.
"""

import threading
import time
from collections import deque

import cv2

from . import ingest, settings, sources
from .pipelines import PIPELINES

# Encodage de l'aperçu diffusé : compromis lisibilité / bande passante.
JPEG_QUALITY = 78


class EngineError(Exception):
    """Échec de démarrage, avec un message destiné à l'utilisateur."""


class _Warmup:
    """Import anticipé de Torch et Ultralytics au lancement du service.

    Mesuré sur la machine de développement : `import torch` coûte ~170 s à
    froid. Le payer au démarrage du service, pendant que l'utilisateur
    configure son scénario, évite une étape « Chargement des modèles » qui
    paraîtrait figée. Rien n'est annoncé prêt pour autant : la séquence de
    démarrage attend réellement la fin de cet import.
    """

    def __init__(self):
        self.done = threading.Event()
        self.error = None
        self.device = None
        self.started_at = None

    def begin(self):
        self.started_at = time.time()
        threading.Thread(target=self._load, daemon=True).start()

    def _load(self):
        try:
            import torch
            from ultralytics import YOLO  # noqa: F401

            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        except Exception as exc:  # pragma: no cover - dépend de l'environnement
            self.error = str(exc)
        finally:
            self.done.set()

    def wait(self, timeout=None):
        self.done.wait(timeout)
        return self.error

    def state(self):
        if self.done.is_set():
            return {'ready': self.error is None, 'error': self.error, 'device': self.device}
        elapsed = round(time.time() - self.started_at, 1) if self.started_at else 0
        return {'ready': False, 'error': None, 'device': None, 'elapsed_seconds': elapsed}


warmup = _Warmup()


def _steps_for(with_zones: bool) -> list:
    return [
        {'id': 'source', 'label': 'Connexion à la source', 'status': 'pending', 'detail': None},
        {'id': 'models', 'label': 'Chargement des modèles', 'status': 'pending', 'detail': None},
        {
            'id': 'zones',
            'label': 'Initialisation des zones',
            'status': 'pending' if with_zones else 'skipped',
            'detail': None if with_zones else 'Sans objet pour ce scénario',
        },
        {'id': 'pipeline', 'label': 'Démarrage du pipeline', 'status': 'pending', 'detail': None},
    ]


class EngineSession:
    """Une exécution : sa configuration, ses ressources, son état courant."""

    def __init__(self, session_id, scenario, config, defaults):
        self.id = session_id
        self.scenario = scenario
        self.config = config
        self.defaults = defaults

        self.detections = config.get('detections', [])
        self.zones = config.get('zones', []) if settings.requires_zones(defaults, self.detections) else []
        self.with_zones = bool(self.zones)

        self.state = 'starting'
        self.error = None
        self.failed_step = None
        self.steps = _steps_for(self.with_zones)

        self.capture = None
        self.pipeline = None
        self.source_meta = {}

        self.started_at = time.time()
        self.running_since = None
        self.frames = 0
        self.fps = 0.0
        self._fps_window = deque(maxlen=20)

        self.alerts = deque(maxlen=200)
        self._alert_sequence = 0

        self._jpeg = None
        self._frame_event = threading.Condition()
        self._stop = threading.Event()
        self._worker = None
        self._lock = threading.Lock()
        self._finalized = False

    # ── étapes ──

    def _step(self, step_id):
        return next(step for step in self.steps if step['id'] == step_id)

    def _begin(self, step_id):
        self._step(step_id)['status'] = 'running'

    def _done(self, step_id, detail):
        step = self._step(step_id)
        step['status'] = 'ok'
        step['detail'] = detail

    def _fail(self, step_id, detail):
        step = self._step(step_id)
        step['status'] = 'failed'
        step['detail'] = detail
        for other in self.steps:
            if other['status'] == 'pending':
                other['status'] = 'cancelled'
        self.state = 'failed'
        self.failed_step = step_id
        self.error = detail

    # ── séquence de démarrage ──

    def run_startup(self):
        try:
            self._start_source()
            models, inference = self._load_models()
            self._init_zones()
            self._start_pipeline(models, inference)
        except EngineError:
            self.release()
        except Exception as exc:  # pragma: no cover - garde-fou
            current = next(
                (step['id'] for step in self.steps if step['status'] == 'running'), 'pipeline'
            )
            self._fail(current, f'Erreur inattendue : {exc}')
            self.release()

    def _start_source(self):
        self._begin('source')
        source = self.config['source']
        try:
            self.capture, self.source_meta = sources.open_capture(source['type'], source['value'])
        except sources.SourceError as exc:
            self._fail('source', str(exc))
            raise EngineError(str(exc)) from exc

        resolution = f"{self.source_meta['width']}×{self.source_meta['height']}"
        fps = self.source_meta.get('fps')
        self._done('source', f'{resolution}' + (f' à {fps} fps' if fps else ''))

    def _load_models(self):
        self._begin('models')
        specs = settings.model_specs(self.defaults, self.detections)
        missing = [spec['name'] for spec in specs if not spec['resolved_path'].exists()]
        if missing:
            detail = f"Poids introuvables : {', '.join(missing)}"
            self._fail('models', detail)
            raise EngineError(detail)

        # Le préchauffage est généralement terminé ; sinon on l'attend, sans
        # jamais afficher l'étape comme réussie avant qu'il ne le soit.
        error = warmup.wait()
        if error:
            detail = (
                f'Dépendances d\'inférence indisponibles ({error}). '
                'Installez-les avec : pip install ultralytics torch'
            )
            self._fail('models', detail)
            raise EngineError(detail)

        from ultralytics import YOLO

        device = warmup.device or 'cpu'
        models = {}
        for spec in specs:
            try:
                model = YOLO(str(spec['resolved_path']))
                model.to(device)
            except Exception as exc:
                detail = f"Chargement de {spec['name']} impossible : {exc}"
                self._fail('models', detail)
                raise EngineError(detail) from exc
            models[spec['name']] = model

        names = ', '.join(models)
        self._done('models', f'{names} sur {device.upper()}')

        inference = dict(self.defaults.get('inference', {}))
        for spec in specs:
            if 'confidence' in spec and spec['name'] == 'phone_model.pt':
                inference['phone_confidence'] = spec['confidence']
        return models, inference

    def _init_zones(self):
        if not self.with_zones:
            return
        self._begin('zones')
        invalid = [
            zone.get('name', '?')
            for zone in self.zones
            if len(zone.get('polygon', [])) < 3
        ]
        if invalid:
            detail = f"Polygones invalides : {', '.join(invalid)}"
            self._fail('zones', detail)
            raise EngineError(detail)

        width = self.source_meta['width']
        height = self.source_meta['height']
        self._done(
            'zones',
            f'{len(self.zones)} poste(s) projeté(s) sur {width}×{height}',
        )

    def _start_pipeline(self, models, inference):
        self._begin('pipeline')
        factory = PIPELINES.get(self.scenario)
        if factory is None:
            detail = f'Aucun pipeline pour le scénario {self.scenario}.'
            self._fail('pipeline', detail)
            raise EngineError(detail)

        try:
            self.pipeline = factory(
                models=models,
                zones=self.zones,
                thresholds=self.config.get('thresholds', {}),
                confidence=self.config.get('confidence', 0.25),
                detections=self.detections,
                inference=inference,
            )
        except Exception as exc:
            detail = f'Initialisation du pipeline impossible : {exc}'
            self._fail('pipeline', detail)
            raise EngineError(detail) from exc

        # Une première image traitée avant de déclarer le pipeline démarré :
        # c'est la seule preuve que la chaîne complète fonctionne.
        ok, frame = self.capture.read()
        if not ok or frame is None:
            detail = 'Le pipeline n\'a reçu aucune image de la source.'
            self._fail('pipeline', detail)
            raise EngineError(detail)

        try:
            self._publish(self.pipeline.process(frame))
        except Exception as exc:
            detail = f'Le traitement de la première image a échoué : {exc}'
            self._fail('pipeline', detail)
            raise EngineError(detail) from exc

        self.frames = 1
        self.running_since = time.time()
        self.state = 'running'
        self._done('pipeline', 'Première image traitée')

        self._worker = threading.Thread(target=self._loop, daemon=True)
        self._worker.start()

    # ── boucle de traitement ──

    def _loop(self):
        source_fps = self.source_meta.get('fps') or 0
        # Sur un fichier, traiter plus vite que le temps réel fausserait toutes
        # les durées (occupation, endormissement) : on cale sur le débit source.
        min_interval = 1 / source_fps if (self.source_meta.get('looping') and source_fps) else 0

        while not self._stop.is_set():
            tick = time.time()
            ok, frame = self.capture.read()

            if not ok or frame is None:
                if self.source_meta.get('looping'):
                    self.capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                self.state = 'ended'
                self.error = 'Le flux source s\'est interrompu.'
                break

            try:
                self._publish(self.pipeline.process(frame))
            except Exception as exc:  # pragma: no cover - dépend du modèle
                self.state = 'failed'
                self.error = f'Traitement interrompu : {exc}'
                break

            self.frames += 1
            self._collect_events()
            self._measure(tick)

            remaining = min_interval - (time.time() - tick)
            if remaining > 0:
                self._stop.wait(remaining)

        self._finalize()
        self.release()

    def _publish(self, frame):
        ok, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
        if not ok:
            return
        with self._frame_event:
            self._jpeg = buffer.tobytes()
            self._frame_event.notify_all()

    def _collect_events(self):
        for event in self.pipeline.drain_events():
            if event.get('kind') == 'occupation':
                ingest.client.occupation(self, event)
                continue
            self._alert_sequence += 1
            event['id'] = self._alert_sequence
            self.alerts.appendleft(event)
            ingest.client.alert(self, event, snapshot=self._jpeg)

    def _finalize(self):
        if self._finalized:
            return
        self._finalized = True
        if self.pipeline is not None:
            closer = getattr(self.pipeline, 'close_open_occupations', None)
            if closer is not None:
                closer()
            self._collect_events()
        ingest.client.close_session(self.id)

    def _measure(self, tick):
        self._fps_window.append(time.time() - tick)
        if self._fps_window:
            average = sum(self._fps_window) / len(self._fps_window)
            self.fps = round(1 / average, 1) if average > 0 else 0.0

    # ── lecture ──

    def latest_jpeg(self, timeout=5.0):
        with self._frame_event:
            if self._jpeg is None:
                self._frame_event.wait(timeout)
            return self._jpeg

    def wait_for_next(self, previous, timeout=5.0):
        with self._frame_event:
            if self._jpeg is previous:
                self._frame_event.wait(timeout)
            return self._jpeg

    def status(self):
        return {
            'session_id': self.id,
            'scenario': self.scenario,
            'state': self.state,
            'steps': self.steps,
            'error': self.error,
            'failed_step': self.failed_step,
            'detections': self.detections,
            'source': {
                'type': self.config['source']['type'],
                **{k: v for k, v in self.source_meta.items() if k != 'name'},
            },
            'uptime_seconds': round(time.time() - self.running_since, 1) if self.running_since else 0,
            'frames': self.frames,
            'fps': self.fps,
        }

    def snapshot(self):
        payload = self.status()
        payload['stats'] = self.pipeline.stats() if self.pipeline else None
        payload['alerts'] = list(self.alerts)[:40]
        return payload

    # ── arrêt ──

    def stop(self):
        self._stop.set()
        worker = self._worker
        if worker and worker.is_alive() and worker is not threading.current_thread():
            worker.join(timeout=5)
        if self.state in ('running', 'starting'):
            self.state = 'stopped'
        self._finalize()
        self.release()

    def release(self):
        with self._lock:
            if self.capture is not None:
                self.capture.release()
                self.capture = None
        with self._frame_event:
            self._frame_event.notify_all()


class EngineManager:
    """Une seule session active : le poste de supervision n'en pilote qu'une."""

    def __init__(self):
        self._session = None
        self._lock = threading.Lock()

    @property
    def session(self):
        return self._session

    def start(self, session_id, scenario, config, defaults):
        with self._lock:
            current = self._session
            if current is not None and current.state in ('starting', 'running'):
                raise EngineError(
                    'Une analyse est déjà en cours. Arrêtez-la avant d\'en lancer une autre.'
                )
            session = EngineSession(session_id, scenario, config, defaults)
            self._session = session

        threading.Thread(target=session.run_startup, daemon=True).start()
        return session

    def stop(self):
        session = self._session
        if session is None:
            return None
        session.stop()
        return session

    def require(self, session_id=None):
        session = self._session
        if session is None:
            raise EngineError('Aucune analyse en cours.')
        if session_id and session.id != session_id:
            raise EngineError('Cette session n\'est plus active.')
        return session


manager = EngineManager()
