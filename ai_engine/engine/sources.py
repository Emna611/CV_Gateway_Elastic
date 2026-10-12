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

# YouTube livre du HLS/DASH HTTP : nobuffer/low_delay (faits pour le RTSP)
# empêchent FFmpeg d'ouvrir la playlist. Un User-Agent + Referer évitent
# les 403 de googlevideo.
YOUTUBE_HTTP_OPTIONS = (
    "user_agent;Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    "|headers;Referer: https://www.youtube.com/\r\n"
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


def _deno_binary() -> str | None:
    """Localise Deno hors du PATH du processus (install user Windows, Docker)."""
    env = os.environ.get("DENO") or os.environ.get("DENO_PATH")
    if env and Path(env).is_file():
        return env
    found = shutil.which("deno")
    if found:
        return found
    name = "deno.exe" if os.name == "nt" else "deno"
    for candidate in (
        Path.home() / ".deno" / "bin" / name,
        settings.BASE_DIR / "tools" / "deno" / name,
        Path("/usr/local/bin/deno"),
        Path("/usr/bin/deno"),
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def _js_runtime_args() -> list[str]:
    """Active un runtime JS supporté pour le déchiffrement des signatures YouTube.

    yt-dlp n'active que Deno par défaut. Node n'est accepté qu'à partir de la
    22, et seulement si on passe --js-runtimes node.
    """
    deno = _deno_binary()
    if deno:
        return ["--js-runtimes", f"deno:{deno}"]
    node = shutil.which("node")
    if node and _node_major(node) >= 22:
        return ["--no-js-runtimes", "--js-runtimes", f"node:{node}"]
    return []


def _node_major(node: str) -> int:
    try:
        completed = subprocess.run(
            [node, "-v"], capture_output=True, text=True, timeout=5
        )
    except (OSError, subprocess.TimeoutExpired):
        return 0
    raw = (completed.stdout or "").strip().lstrip("v")
    try:
        return int(raw.split(".", 1)[0])
    except ValueError:
        return 0


def _yt_dlp_launcher() -> list[str]:
    """Préfère le yt-dlp du venv courant, pas un binaire PATH éventuellement plus vieux."""
    return [sys.executable, "-m", "yt_dlp"]


def _yt_dlp_env() -> dict:
    env = os.environ.copy()
    deno = _deno_binary()
    if deno:
        env["PATH"] = str(Path(deno).parent) + os.pathsep + env.get("PATH", "")
    return env


YOUTUBE_RESOLVE_TIMEOUT = 70
YOUTUBE_FORMAT = (
    "bv*[vcodec^=avc1][height<=720]/"
    "bv*[height<=720][protocol^=m3u8]/"
    "bv*[height<=720][ext=mp4]/"
    "bv*[height<=720]/"
    "bv*/"
    "b[height<=720]/"
    "b/"
    "18"
)


def _yt_dlp_stderr_hint(stderr: str) -> str:
    for line in reversed((stderr or "").splitlines()):
        text = line.strip()
        if not text:
            continue
        if text.startswith("ERROR:"):
            return text.removeprefix("ERROR:").strip()
        if "No supported JavaScript runtime" in text:
            return (
                "YouTube exige un runtime JavaScript. Installez Deno 2.3+ "
                "(https://deno.land) et relancez le moteur."
            )
    return ""


def _resolve_youtube_stream(url: str) -> str:
    """Demande à yt-dlp une URL de flux directe.

    YouTube ne livre plus le MP4 progressif muxé (itag 18). OpenCV n'a besoin
    que de la vidéo : on privilégie un flux vidéo seul (HLS ou DASH). Depuis
    2025, le déchiffrement des signatures demande un runtime JS (Deno).
    """
    # Une seule URL pour OpenCV : pas de combinaison bestvideo+bestaudio (-g
    # en sortirait deux). L'audio est inutile pour l'inférence.
    js_args = _js_runtime_args()
    # D'abord sans runtime JS : souvent suffisant (HLS/DASH vidéo) et plus rapide.
    # Deno ensuite, pour les lives / vidéos sans format progressif.
    attempts = [([], settings.OPEN_TIMEOUT + 8)]
    if js_args:
        attempts.append((js_args, YOUTUBE_RESOLVE_TIMEOUT))

    last_error = None
    last_stderr = ""
    seen = set()
    for extra, timeout in attempts:
        key = tuple(extra)
        if key in seen:
            continue
        seen.add(key)
        command = (
            _yt_dlp_launcher()
            + extra
            + ["--no-playlist", "--no-warnings", "-f", YOUTUBE_FORMAT, "-g", url]
        )
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout,
                env=_yt_dlp_env(),
            )
        except subprocess.TimeoutExpired as exc:
            last_error = exc
            continue
        except OSError as exc:
            raise SourceError(f"yt-dlp introuvable ou inexécutable : {exc}.") from exc

        lines = [line for line in completed.stdout.splitlines() if line.strip()]
        if completed.returncode == 0 and lines:
            return lines[0]
        last_stderr = completed.stderr or ""
        last_error = None

    hint = _yt_dlp_stderr_hint(last_stderr)
    if isinstance(last_error, subprocess.TimeoutExpired):
        raise SourceError(
            f"Délai dépassé : yt-dlp n'a pas résolu le flux YouTube "
            f"({YOUTUBE_RESOLVE_TIMEOUT:.0f}s)."
        ) from last_error
    if not _deno_binary() and "No supported JavaScript runtime" in last_stderr:
        raise SourceError(
            "Flux YouTube non résolvable : aucun runtime JavaScript (Deno 2.3+) "
            "n'est installé. Installez Deno depuis https://deno.land puis relancez le moteur."
        )
    if hint:
        raise SourceError(f"Flux YouTube non résolvable : {hint}")
    raise SourceError("Flux YouTube non résolvable : yt-dlp n'a obtenu aucune URL.")


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
    try:
        stream_url = _resolve_youtube_stream(f"https://www.youtube.com/watch?v={video_id}")
    except SourceError:
        stream_url = None
    if stream_url:
        cap = None
        try:
            cap = _open_with_timeout(stream_url, cv2.CAP_FFMPEG, ffmpeg_options=YOUTUBE_HTTP_OPTIONS)
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
        target, backend, options = stream, cv2.CAP_FFMPEG, YOUTUBE_HTTP_OPTIONS
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
