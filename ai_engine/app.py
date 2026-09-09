"""Point d'entrée du moteur d'inférence CV-Gateway Elastic (Flask, :5000)."""

import logging

from flask import Flask, jsonify

from engine import runtime, settings
from engine.api import api


def create_app() -> Flask:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = settings.MAX_UPLOAD_BYTES
    # Les messages d'erreur sont en français : pas d'échappement \uXXXX.
    app.json.ensure_ascii = False
    app.register_blueprint(api)

    # L'import de Torch est lent à froid : il démarre maintenant, en fond, pour
    # ne pas être payé au moment où l'utilisateur lance son analyse.
    runtime.warmup.begin()

    @app.errorhandler(413)
    def too_large(_):
        limit = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        return jsonify({"ok": False, "error": f"Fichier trop volumineux (limite {limit} Mo)."}), 413

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"ok": False, "error": "Route inconnue."}), 404

    return app


if __name__ == "__main__":
    engine_config = settings.CONFIG.get("engine", {})
    create_app().run(
        host=engine_config.get("host", "127.0.0.1"),
        port=int(engine_config.get("port", 5000)),
        threaded=True,
        debug=False,
    )
