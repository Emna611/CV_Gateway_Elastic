"""Routes HTTP du moteur d'inférence."""

import re

from flask import Blueprint, jsonify, request, send_from_directory

from . import mailer, settings, sources, store

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
    return jsonify(
        {
            "ok": True,
            "service": "ai_engine",
            "scenarios": settings.scenario_ids(),
            "smtp": mailer.smtp_status(),
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
    return jsonify({"ok": True, "smtp": mailer.smtp_status()})


@api.post("/email/test")
def email_test():
    payload = request.get_json(silent=True) or {}
    recipient = str(payload.get("recipient") or "").strip()
    if not store.EMAIL_RE.match(recipient):
        return _fail("Adresse destinataire invalide.", 422)

    scenario_id = payload.get("scenario")
    defaults = settings.scenario_defaults(scenario_id) if scenario_id else None
    label = defaults["label"] if defaults else "non précisé"

    try:
        result = mailer.send_test(recipient, label)
    except mailer.SmtpNotConfigured as exc:
        return _fail(str(exc), 503, configured=False)
    except mailer.EmailError as exc:
        return _fail(str(exc), 502)

    return jsonify({"ok": True, "message": f"Email envoyé à {recipient}.", **result})
