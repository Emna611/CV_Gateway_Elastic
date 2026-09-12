"""Test réel des sources vidéo et extraction de la première frame.

Aucune fonction de ce module ne renvoie un succès sans avoir réellement ouvert
la source et décodé une image. Un échec remonte toujours une raison lisible.
"""

import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import cv2
import requests

from . import settings

FFMPEG_OPTIONS_KEY = "OPENCV_FFMPEG_CAPTURE_OPTIONS"

# Options réservées au RTSP : sans délai d'attente, une IP injoignable bloque
# la requête pendant des dizaines de secondes. Elles ne doivent PAS s'appliquer
# aux fichiers locaux ni aux flux HTTP, dont elles perturbent l'ouverture.
RTSP_OPTIONS = (
    f"rtsp_transport;{settings.RTSP_TRANSPORT}"
    f"|timeout;{int(settings.OPEN_TIMEOUT * 1_000_000)}"
    "|fflags;nobuffer|flags;low_delay|max_delay;500000"
)

# OpenCV lit cette variable d'environnement à la création de chaque
# VideoCapture : la portée est donc gérée par ce verrou plutôt que par un
# réglage global au démarrage.
_FFMPEG_LOCK = threading.Lock()


@contextmanager
def _ffmpeg_options(options):
    if not options:
        yield
        return
    with _FFMPEG_LOCK:
        previous = os.environ.get(FFMPEG_OPTIONS_KEY)
        os.environ[FFMPEG_OPTIONS_KEY] = options
        try:
            yield
        finally:
            if previous is None:
                os.environ.pop(FFMPEG_OPTIONS_KEY, None)
            else:
                os.environ[FFMPEG_OPTIONS_KEY] = previous

YOUTUBE_ID_PATTERNS = (
    r"(?:youtube\.com/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})",
    r"(?:youtu\.be/)([A-Za-z0-9_-]{11})",
    r"(?:youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
    r"(?:youtube\.com/embed/)([A-Za-z0-9_-]{11})",
    r"(?:youtube\.com/live/)([A-Za-z0-9_-]{11})",
)


class SourceError(Exception):
    """Échec de test d'une source, avec un message destiné à l'utilisateur."""


# ─────────────────────────── utilitaires ───────────────────────────


def mask_credentials(url: str) -> str:
    """Remplace le mot de passe d'une URL par des points.

    Utilisé pour tout ce qui est renvoyé au client ou journalisé : un mot de
    passe de caméra ne doit pas transiter en clair dans les réponses d'API.
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return url
    if not parsed.password:
        return url
    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"
    netloc = f"{parsed.username or ''}:••••@{host}"
    return urlunparse(parsed._replace(netloc=netloc))


def _save_frame(frame) -> str:
    """Écrit une frame en JPEG et renvoie son jeton d'accès."""
    token = f"{uuid.uuid4().hex}.jpg"
    target = settings.FRAMES_DIR / token
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not ok:
        raise SourceError("La frame n'a pas pu être encodée en JPEG.")
    target.write_bytes(buffer.tobytes())
    return token


def _open_with_timeout(target, backend=None, ffmpeg_options=None):
    """Ouvre une VideoCapture sans jamais bloquer l'API indéfiniment.

    Le délai FFMPEG couvre le réseau mais pas toutes les phases de
    négociation, d'où ce garde-fou par thread. Le thread est daemon : si
    l'ouverture finit par aboutir après l'abandon, la capture est libérée par
    le thread lui-même.
    """
    result = {}

    def _worker():
        try:
            cap = cv2.VideoCapture(target, backend) if backend else cv2.VideoCapture(target)
            if result.get("abandoned"):
                cap.release()
                return
            result["cap"] = cap
        except Exception as exc:  # pragma: no cover - dépend du backend natif
            result["error"] = str(exc)

    with _ffmpeg_options(ffmpeg_options):
        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()
        thread.join(timeout=settings.OPEN_TIMEOUT)

    if thread.is_alive():
        result["abandoned"] = True
        raise SourceError(
            f"Délai dépassé ({settings.OPEN_TIMEOUT:.0f}s) : la source n'a pas répondu."
        )
    if "error" in result:
        raise SourceError(f"Ouverture impossible : {result['error']}")
    return result.get("cap")


def _read_first_frame(cap, what: str):
    """Décode la première image utilisable, en tolérant quelques frames vides."""
    for _ in range(15):
        ok, frame = cap.read()
        if ok and frame is not None and frame.size:
            return frame
    raise SourceError(f"{what} ouvert mais aucune image décodable n'a été reçue.")


def _capture_meta(cap, frame) -> dict:
    height, width = frame.shape[:2]
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0

    duration = None
    if fps > 0 and frame_count > 0:
        duration = round(frame_count / fps, 1)

    return {
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or width),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or height),
        "fps": round(fps, 2) if fps > 0 else None,
        "duration_seconds": duration,
        "frame_count": int(frame_count) if frame_count > 0 else None,
    }


# ─────────────────────────── fichier local ───────────────────────────


def resolve_upload(value: str) -> Path:
    """Résout un chemin relatif reçu du client à l'intérieur de data/.

    Empêche la remontée d'arborescence : seul le contenu de data/ est lisible.
    """
    candidate = (settings.DATA_DIR / Path(value).name).resolve()
    if candidate.parent != settings.DATA_DIR.resolve():
        raise SourceError("Chemin de fichier refusé.")
    if not candidate.exists():
        raise SourceError("Le fichier n'existe plus dans ai_engine/data/.")
    return candidate


def store_upload(file_storage) -> Path:
    """Enregistre un fichier téléversé dans ai_engine/data/."""
    original = Path(file_storage.filename or "").name
    if not original:
        raise SourceError("Aucun nom de fichier reçu.")

    extension = Path(original).suffix.lower()
    if extension not in settings.ALLOWED_EXTENSIONS:
        autorises = ", ".join(settings.ALLOWED_EXTENSIONS)
        raise SourceError(f"Format {extension or 'inconnu'} refusé. Formats acceptés : {autorises}.")

    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(original).stem)[:60] or "source"
    target = settings.DATA_DIR / f"{stem}_{uuid.uuid4().hex[:8]}{extension}"
    file_storage.save(str(target))

    if target.stat().st_size == 0:
        target.unlink(missing_ok=True)
        raise SourceError("Le fichier reçu est vide.")
    return target


def test_file(value: str) -> dict:
    path = resolve_upload(value)
    cap = _open_with_timeout(str(path))
    if cap is None or not cap.isOpened():
        if cap is not None:
            cap.release()
        raise SourceError("Fichier illisible : codec non supporté ou fichier corrompu.")
    try:
        frame = _read_first_frame(cap, "Fichier")
        meta = _capture_meta(cap, frame)
    finally:
        cap.release()

    meta["name"] = path.name
    meta["size_mb"] = round(path.stat().st_size / (1024 * 1024), 1)
    return {
        "message": f"Fichier lisible : {meta['width']}×{meta['height']}",
        "meta": meta,
        "preview": {"kind": "frame", "token": _save_frame(frame)},
    }


# ─────────────────────────── YouTube ───────────────────────────


def youtube_id(url: str) -> str | None:
    for pattern in YOUTUBE_ID_PATTERNS:
        match = re.search(pattern, url.strip())
        if match:
            return match.group(1)
    return None


def _resolve_youtube_stream(url: str) -> str | None:
    """Demande à yt-dlp une URL de flux directe, si yt-dlp est disponible.

    Renvoie None si la résolution échoue, ce qui fait basculer test_youtube en
    mode dégradé (titre + miniature) sans jamais prétendre que le flux est
    décodable.

    Limite connue : depuis 2025, YouTube exige un runtime JavaScript (deno) que
    yt-dlp appelle pour déchiffrer les signatures d'URL. Sans ce runtime,
    aucune URL de flux n'est obtenue. L'inférence sur source YouTube (phase 4)
    suppose donc l'installation d'un runtime JS sur la machine hôte.
    """
    # OpenCV ne lit qu'une seule URL : il faut un format déjà muxé (b), pas une
    # combinaison vidéo+audio séparée. 18 = mp4 360p progressif, très courant.
    fmt = "b[height<=720]/18/b"

    # sys.executable garantit l'interpréteur du venv courant : shutil.which ne
    # trouve yt-dlp que si le venv est activé, ce qui n'est pas toujours le cas.
    binary = shutil.which("yt-dlp")
    launcher = [binary] if binary else [sys.executable, "-m", "yt_dlp"]
    command = launcher + ["-f", fmt, "-g", url]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=settings.OPEN_TIMEOUT + 8,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    return lines[0] if lines else None


def test_youtube(url: str) -> dict:
    video_id = youtube_id(url)
    if not video_id:
        raise SourceError(
            "URL YouTube non reconnue. Formats attendus : youtube.com/watch?v=…, "
            "youtu.be/…, youtube.com/shorts/…"
        )

    # oEmbed est une vérification réelle d'existence : une vidéo supprimée,
    # privée ou inexistante ne renvoie pas 200.
    try:
        response = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=8,
        )
    except requests.RequestException as exc:
        raise SourceError(f"YouTube injoignable : {exc.__class__.__name__}.") from exc

    if response.status_code == 404:
        raise SourceError("Vidéo introuvable : elle a été supprimée ou l'identifiant est faux.")
    if response.status_code == 401:
        raise SourceError("Vidéo privée : elle ne peut pas être lue par le moteur.")
    if response.status_code != 200:
        raise SourceError(f"YouTube a répondu {response.status_code} : vidéo non résolvable.")

    try:
        payload = response.json()
    except ValueError as exc:
        raise SourceError("Réponse YouTube illisible.") from exc

    meta = {
        "video_id": video_id,
        "title": payload.get("title"),
        "author": payload.get("author_name"),
        "thumbnail": payload.get("thumbnail_url")
        or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
    }

    # La miniature prouve l'existence de la vidéo, pas la capacité du moteur à
    # la décoder. On tente donc une vraie extraction de frame via yt-dlp et on
    # indique clairement au client ce qu'il regarde.
    stream_url = _resolve_youtube_stream(f"https://www.youtube.com/watch?v={video_id}")
    if stream_url:
        cap = None
        try:
            cap = _open_with_timeout(stream_url, cv2.CAP_FFMPEG)
            if cap is not None and cap.isOpened():
                frame = _read_first_frame(cap, "Flux YouTube")
                meta.update(_capture_meta(cap, frame))
                token = _save_frame(frame)
                return {
                    "message": f"Flux décodé : {meta['width']}×{meta['height']}",
                    "meta": meta,
                    "preview": {"kind": "frame", "token": token},
                }
        except SourceError:
            pass
        finally:
            if cap is not None:
                cap.release()

    return {
        "message": "Vidéo résolue. Le flux n'a pas pu être décodé ici : "
        "aperçu limité à la miniature.",
        "degraded": True,
        "meta": meta,
        "preview": {"kind": "thumbnail", "url": meta["thumbnail"]},
    }


# ─────────────────────────── RTSP ───────────────────────────


def test_rtsp(url: str) -> dict:
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme != "rtsp":
        raise SourceError("L'URL doit commencer par rtsp://")
    if not parsed.hostname:
        raise SourceError("URL RTSP incomplète : hôte manquant.")

    cap = _open_with_timeout(url, cv2.CAP_FFMPEG, ffmpeg_options=RTSP_OPTIONS)
    if cap is None or not cap.isOpened():
        if cap is not None:
            cap.release()
        raise SourceError(
            "Connexion refusée : vérifiez l'identifiant, le mot de passe, "
            "le port et le chemin du flux."
        )
    try:
        frame = _read_first_frame(cap, "Flux RTSP")
        meta = _capture_meta(cap, frame)
    finally:
        cap.release()

    meta["host"] = parsed.hostname
    meta["port"] = parsed.port or 554
    meta.pop("duration_seconds", None)
    meta.pop("frame_count", None)
    return {
        "message": f"Caméra connectée : {meta['width']}×{meta['height']}",
        "meta": meta,
        "preview": {"kind": "frame", "token": _save_frame(frame)},
    }


# ─────────────────────────── dispatch ───────────────────────────

TESTERS = {"file": test_file, "youtube": test_youtube, "rtsp": test_rtsp}


def open_capture(source_type: str, value: str):
    """Ouvre la source pour le traitement continu et renvoie (capture, méta).

    Utilisée au démarrage du moteur : le test de l'écran de configuration ne
    garantit rien sur l'instant présent, la connexion est donc refaite.
    """
    value = (value or "").strip()
    if not value:
        raise SourceError("Aucune source renseignée.")

    if source_type == "file":
        path = resolve_upload(value)
        cap = cv2.VideoCapture(str(path))
        if cap is None or not cap.isOpened():
            if cap is not None:
                cap.release()
            raise SourceError("Fichier illisible : codec non supporté ou fichier corrompu.")
        try:
            frame = _read_first_frame(cap, "Fichier")
        except SourceError:
            cap.release()
            raise
        meta = _capture_meta(cap, frame)
        meta["looping"] = True
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap, meta

    if source_type == "rtsp":
        target, backend, options = value, cv2.CAP_FFMPEG, RTSP_OPTIONS
    elif source_type == "youtube":
        video_id = youtube_id(value)
        if not video_id:
            raise SourceError("URL YouTube non reconnue.")
        stream = _resolve_youtube_stream(f"https://www.youtube.com/watch?v={video_id}")
        if not stream:
            raise SourceError(
                "Flux YouTube non résolvable : yt-dlp n'a obtenu aucune URL. "
                "YouTube exige un runtime JavaScript (deno) sur la machine hôte."
            )
        target, backend, options = (
            stream,
            cv2.CAP_FFMPEG,
            "fflags;nobuffer|flags;low_delay|max_delay;500000",
        )
    else:
        raise SourceError(f"Type de source inconnu : {source_type}")

    cap = _open_with_timeout(target, backend, ffmpeg_options=options)
    if cap is None or not cap.isOpened():
        if cap is not None:
            cap.release()
        raise SourceError("La source n'a pas pu être ouverte.")

    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    try:
        frame = _read_first_frame(cap, "Source")
    except SourceError:
        cap.release()
        raise

    meta = _capture_meta(cap, frame)
    meta["looping"] = False
    return cap, meta


def test_source(source_type: str, value: str) -> dict:
    tester = TESTERS.get(source_type)
    if tester is None:
        raise SourceError(f"Type de source inconnu : {source_type}")
    if not value or not value.strip():
        raise SourceError("Aucune source renseignée.")
    return tester(value.strip())
