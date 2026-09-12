"""Routes HTTP du moteur d'inférence."""

import re
import time
import uuid

from flask import Blueprint, Response, jsonify, request, send_from_directory

from . import ingest, runtime, settings, sources, store

api = Blueprint("api", __name__, url_prefix="/api")

TOKEN_RE = re.compile(r"^[0-9a-f]{32}\.jpg$")


def _fail(message: str, status: int = 400, **extra):
    return jsonify({"ok": False, "error": message, **extra}), status


def _with_preview_url(result: dict) -> dict:
    """Transforme un jeton de frame en URL exploitable par le frontend."""
    preview = result.get("preview")
    if preview and preview.get("kind") == "frame" and preview.get("token"):
        preview["url"] = f"/api/source/frame/{preview.pop('token')}"
    return result


# ─────────────────────────── santé ───────────────────────────


@api.get("/health")
def health():
    smtp = {"configured": False}
    try:
        payload = ingest.request_json("GET", "/api/notify/email/status", timeout=3)
        smtp = {k: v for k, v in payload.items() if k != "ok"}
    except ingest.LaravelError:
        pass
    return jsonify(
        {
            "ok": True,
            "service": "ai_engine",
            "scenarios": settings.scenario_ids(),
            "smtp": smtp,
            "inference": runtime.warmup.state(),
        }
    )


# ─────────────────────────── configuration ───────────────────────────


@api.get("/config/defaults/<scenario_id>")
def config_defaults(scenario_id):
    defaults = settings.scenario_defaults(scenario_id)
    if defaults is None:
        return _fail(f"Scénario inconnu : {scenario_id}", 404)
    return jsonify({"ok": True, "defaults": defaults})


@api.get("/config/<scenario_id>")
def config_get(scenario_id):
    if settings.scenario_defaults(scenario_id) is None:
        return _fail(f"Scénario inconnu : {scenario_id}", 404)
    saved = store.load(scenario_id)
    return jsonify({"ok": True, "config": saved})


@api.put("/config/<scenario_id>")
def config_put(scenario_id):
    try:
        config = store.validate(scenario_id, request.get_json(silent=True) or {})
    except store.ValidationError as exc:
        return _fail(str(exc), 422)

    store.save(scenario_id, config)
    return jsonify({"ok": True, "config": config})


# ─────────────────────────── sources ───────────────────────────


@api.post("/source/upload")
def source_upload():
    file_storage = request.files.get("file")
    if file_storage is None:
        return _fail("Aucun fichier reçu (champ « file » attendu).")

    try:
        path = sources.store_upload(file_storage)
    except sources.SourceError as exc:
        return _fail(str(exc))

    # Un fichier accepté n'est pas un fichier lisible : on le sonde tout de
    # suite pour ne renvoyer durée et résolution qu'après décodage réel.
    try:
        result = sources.test_file(path.name)
    except sources.SourceError as exc:
        path.unlink(missing_ok=True)
        return _fail(f"Fichier téléversé mais illisible : {exc}", 422)

    return jsonify({"ok": True, "value": path.name, **_with_preview_url(result)})


@api.post("/source/test")
def source_test():
    payload = request.get_json(silent=True) or {}
    source_type = payload.get("type")
    value = payload.get("value") or ""

    try:
        result = sources.test_source(source_type, value)
    except sources.SourceError as exc:
        return _fail(str(exc), 422)

    display = sources.mask_credentials(value) if source_type == "rtsp" else value
    return jsonify({"ok": True, "type": source_type, "display": display, **_with_preview_url(result)})


@api.get("/source/frame/<token>")
def source_frame(token):
    if not TOKEN_RE.match(token):
        return _fail("Jeton de frame invalide.", 404)
    if not (settings.FRAMES_DIR / token).exists():
        return _fail("Frame expirée : relancez le test de la source.", 404)
    return send_from_directory(settings.FRAMES_DIR, token, mimetype="image/jpeg")


# ─────────────────────────── email ───────────────────────────


@api.get("/email/status")
def email_status():
    try:
        payload = ingest.request_json("GET", "/api/notify/email/status")
    except ingest.LaravelError as exc:
        return _fail(str(exc), exc.status, configured=False)
    return jsonify({"ok": True, **{k: v for k, v in payload.items() if k != "ok"}})


@api.post("/email/test")
def email_test():
    payload = request.get_json(silent=True) or {}
    recipient = str(payload.get("recipient") or "").strip()
    if not store.EMAIL_RE.match(recipient):
        return _fail("Adresse destinataire invalide.", 422)

    scenario_id = payload.get("scenario")
    try:
        result = ingest.request_json(
            "POST",
            "/api/notify/email/test",
            {"recipient": recipient, "scenario": scenario_id},
        )
    except ingest.LaravelError as exc:
        configured = exc.status != 503
        return _fail(str(exc), 503 if exc.status == 503 else min(exc.status, 502), configured=configured)

    return jsonify(
        {
            "ok": True,
            "message": result.get("message") or f"Email envoyé à {recipient}.",
            "via": result.get("via") or "Laravel",
        }
    )


# ─────────────────────────── SMS ───────────────────────────


@api.get("/sms/status")
def sms_status():
    try:
        payload = ingest.request_json("GET", "/api/notify/sms/status")
    except ingest.LaravelError as exc:
        return _fail(str(exc), exc.status, configured=False)
    return jsonify({"ok": True, **{k: v for k, v in payload.items() if k != "ok"}})


@api.post("/sms/test")
def sms_test():
    payload = request.get_json(silent=True) or {}
    phone = str(payload.get("phone") or "").strip()
    try:
        normalized = store.normalize_phone(phone)
    except ValueError as exc:
        return _fail(str(exc).split(" : ", 1)[-1], 422)
    if not normalized:
        return _fail("Numéro destinataire invalide.", 422)

    try:
        result = ingest.request_json("POST", "/api/notify/sms/test", {"phone": normalized})
    except ingest.LaravelError as exc:
        configured = exc.status != 503
        return _fail(str(exc), 503 if exc.status == 503 else min(exc.status, 502), configured=configured)

    return jsonify(
        {
            "ok": True,
            "message": result.get("message") or f"SMS envoyé à {normalized}.",
            "via": result.get("via") or "Twilio",
        }
    )


# ─────────────────────────── moteur ───────────────────────────


@api.post("/engine/start")
def engine_start():
    body = request.get_json(silent=True) or {}
    scenario_id = body.get("scenario")
    defaults = settings.scenario_defaults(scenario_id)
    if defaults is None:
        return _fail(f"Scénario inconnu : {scenario_id}", 404)

    # Accepte le format du brief (config à la racine) comme le format
    # encapsulé { scenario, config } du client React.
    payload = body.get("config") if isinstance(body.get("config"), dict) else body

    # La configuration repasse par la même validation que l'enregistrement :
    # le moteur ne démarre jamais sur une configuration non vérifiée.
    try:
        config = store.validate(scenario_id, payload)
    except store.ValidationError as exc:
        return _fail(str(exc), 422)

    if settings.requires_zones(defaults, config["detections"]) and not config["zones"]:
        return _fail("Aucune zone tracée : l'occupation des postes en exige au moins une.", 422)

    store.save(scenario_id, config)

    try:
        session = runtime.manager.start(uuid.uuid4().hex, scenario_id, config, defaults)
    except runtime.EngineError as exc:
        return _fail(str(exc), 409)

    # 202 : la séquence de démarrage se poursuit, le client suit par sondage.
    return jsonify({"ok": True, "status": session.status()}), 202


@api.get("/engine/status")
def engine_status():
    session = runtime.manager.session
    if session is None:
        return jsonify({"ok": True, "status": {"state": "idle"}})
    return jsonify(
        {"ok": True, "status": session.status(), "inference": runtime.warmup.state()}
    )


@api.get("/engine/snapshot")
def engine_snapshot():
    session = runtime.manager.session
    if session is None:
        return jsonify({"ok": True, "status": {"state": "idle"}})
    return jsonify({"ok": True, "status": session.snapshot()})


@api.post("/engine/stop")
def engine_stop():
    session = runtime.manager.stop()
    if session is None:
        return jsonify({"ok": True, "status": {"state": "idle"}})
    return jsonify({"ok": True, "status": session.status()})


@api.patch("/engine/detections")
def engine_detections():
    session = runtime.manager.session
    if session is None or session.state != "running":
        return _fail("Aucune analyse en cours.", 409)

    body = request.get_json(silent=True) or {}
    try:
        detections = store.normalize_detections(session.defaults, body.get("detections"))
        session.update_detections(detections)
    except store.ValidationError as exc:
        return _fail(str(exc), 422)
    except runtime.EngineError as exc:
        return _fail(str(exc), 422)

    store.save(session.scenario, session.config)
    return jsonify({"ok": True, "status": session.status()})


@api.patch("/engine/alerts")
def engine_alerts():
    session = runtime.manager.session
    if session is None or session.state != "running":
        return _fail("Aucune analyse en cours.", 409)

    body = request.get_json(silent=True) or {}
    try:
        notifications = store.normalize_notifications(
            session.defaults,
            session.detections,
            body.get("email", session.config.get("email")),
            body.get("sms", session.config.get("sms")),
        )
        session.update_notifications(notifications["email"], notifications["sms"])
    except store.ValidationError as exc:
        return _fail(str(exc), 422)
    except runtime.EngineError as exc:
        return _fail(str(exc), 409)

    store.save(session.scenario, session.config)
    return jsonify({"ok": True, "status": session.status()})


@api.get("/engine/frame")
def engine_frame():
    session = runtime.manager.session
    if session is None or session.state not in ("running", "starting"):
        return _fail("Aucune analyse en cours.", 409)

    jpeg = session.latest_jpeg(timeout=0.4)
    if jpeg is None:
        return _fail("Aucune frame disponible.", 404)

    return Response(
        jpeg,
        mimetype="image/jpeg",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@api.get("/engine/stream")
def engine_stream():
    session = runtime.manager.session
    if session is None or session.state not in ("running", "starting"):
        return _fail("Aucune analyse en cours.", 409)

    boundary = "frame"

    def frames():
        latest = None
        while session.state in ("running", "starting"):
            jpeg = session.wait_for_next(latest, timeout=2.0)
            if jpeg is None:
                time.sleep(0.05)
                continue
            if jpeg is latest:
                continue
            latest = jpeg
            yield (
                b"--" + boundary.encode() + b"\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n"
            )

    return Response(
        frames(),
        mimetype=f"multipart/x-mixed-replace; boundary={boundary}",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
