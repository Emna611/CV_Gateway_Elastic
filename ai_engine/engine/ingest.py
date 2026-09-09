"""Client HTTP vers Laravel : occupations, alertes, fermeture de session.

Les appels partent d'une file à un seul fil : l'inférence n'attend jamais
la réponse, et l'ordre enter/exit d'une zone est conservé. Si Laravel est
arrêté, l'échec est journalisé et le moteur continue.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from . import settings, sources

logger = logging.getLogger(__name__)

TIMEOUT = 5


def _iso(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def camera_id_of(config: dict) -> str:
    source = config.get("source") or {}
    kind = source.get("type") or "unknown"
    value = str(source.get("value") or "")
    if kind == "rtsp":
        return sources.mask_credentials(value)[:255]
    return (value or kind)[:255]


class LaravelIngest:
    def __init__(self):
        self._queue: queue.Queue = queue.Queue(maxsize=500)
        self._warned = False
        worker = threading.Thread(target=self._run, daemon=True)
        worker.start()

    def occupation(self, session, event: dict) -> None:
        self._put(
            {
                "method": "POST",
                "path": "/api/ingest/occupations",
                "json": {
                    "action": event["action"],
                    "session_id": session.id,
                    "scenario": session.scenario,
                    "zone_id": event.get("zone_id"),
                    "zone_name": event.get("zone_name"),
                    "camera_id": camera_id_of(session.config),
                    "activity_state": event.get("activity_state") or "ACTIVE",
                    "entered_at": _iso(event.get("entered_at")),
                    "exited_at": _iso(event.get("exited_at")),
                    "duration_seconds": event.get("duration_seconds"),
                },
            }
        )

    def alert(self, session, event: dict, snapshot: bytes | None = None) -> None:
        payload = {
            "type": event.get("type"),
            "severity": event.get("severity"),
            "scenario": session.scenario,
            "session_id": session.id,
            "camera_id": camera_id_of(session.config),
            "zone_name": event.get("zone_name"),
            "confidence": event.get("confidence"),
            "duration": event.get("duration"),
            "created_at": _iso(event.get("at")),
            "email": session.config.get("email") or {},
        }
        item: dict[str, Any] = {
            "method": "POST",
            "path": "/api/ingest/alerts",
            "json": payload,
        }
        if snapshot:
            item["snapshot"] = snapshot
        self._put(item)

    def close_session(self, session_id: str) -> None:
        self._put(
            {
                "method": "POST",
                "path": f"/api/ingest/sessions/{session_id}/close",
                "json": {},
            }
        )

    def _put(self, item: dict) -> None:
        if not settings.ingest_token():
            if not self._warned:
                logger.warning("INGEST_TOKEN manquant : persistance Laravel désactivée.")
                self._warned = True
            return
        try:
            self._queue.put_nowait(item)
        except queue.Full:
            logger.warning("File d'ingestion Laravel saturée, un événement est perdu.")

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            try:
                self._send(item)
            except Exception as exc:  # pragma: no cover - réseau
                logger.warning("Ingestion Laravel échouée (%s) : %s", item.get("path"), exc)

    def _send(self, item: dict) -> None:
        url = settings.laravel_url().rstrip("/") + item["path"]
        token = settings.ingest_token()
        headers = {
            "Accept": "application/json",
            "X-Ingest-Token": token,
        }
        snapshot = item.get("snapshot")
        if snapshot:
            body, content_type = _multipart(item.get("json") or {}, snapshot)
            headers["Content-Type"] = content_type
            data = body
        else:
            data = json.dumps(item.get("json") or {}, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = urllib.request.Request(url, data=data, headers=headers, method=item["method"])
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            logger.warning("Laravel %s -> HTTP %s : %s", item["path"], exc.code, detail)
        except urllib.error.URLError as exc:
            logger.warning("Laravel injoignable (%s) : %s", url, exc.reason)


def _multipart(fields: dict, snapshot: bytes) -> tuple[bytes, str]:
    import uuid

    boundary = "----cvgateway" + uuid.uuid4().hex
    chunks: list[bytes] = []
    payload = json.dumps(fields, ensure_ascii=False)
    chunks.append(
        (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="payload"\r\n\r\n'
            f"{payload}\r\n"
        ).encode("utf-8")
    )
    chunks.append(
        (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="snapshot"; filename="capture.jpg"\r\n'
            "Content-Type: image/jpeg\r\n\r\n"
        ).encode("ascii")
        + snapshot
        + b"\r\n"
    )
    chunks.append(f"--{boundary}--\r\n".encode("ascii"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


client = LaravelIngest()
