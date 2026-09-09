"""Envoi réel d'un email de test.

Les alertes de production passent par Laravel (file d'attente + anti-spam).
Ce module ne sert qu'au bouton « Envoyer un email de test » de l'écran de
configuration : il tente un vrai envoi SMTP et remonte l'erreur exacte. Si le
SMTP n'est pas configuré, il le dit au lieu de simuler un succès.
"""

import os
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

REQUIRED = ("SMTP_HOST", "SMTP_PORT", "SMTP_FROM")


class EmailError(RuntimeError):
    pass


class SmtpNotConfigured(EmailError):
    """Le SMTP n'est pas renseigné : ce n'est pas une panne, mais un manque."""


def _load_env() -> dict:
    """Lit ai_engine/.env sans dépendance externe, l'environnement gagne."""
    values = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, raw = line.partition("=")
            values[key.strip()] = raw.strip().strip('"').strip("'")
    values.update({key: value for key, value in os.environ.items() if key.startswith("SMTP_")})
    return values


def smtp_status() -> dict:
    env = _load_env()
    missing = [key for key in REQUIRED if not env.get(key)]
    return {
        "configured": not missing,
        "missing": missing,
        "host": env.get("SMTP_HOST"),
        "from": env.get("SMTP_FROM"),
    }


def send_test(recipient: str, scenario_label: str) -> dict:
    env = _load_env()
    missing = [key for key in REQUIRED if not env.get(key)]
    if missing:
        raise SmtpNotConfigured(
            "SMTP non configuré : renseignez "
            + ", ".join(missing)
            + " dans ai_engine/.env (voir .env.example)."
        )

    host = env["SMTP_HOST"]
    try:
        port = int(env["SMTP_PORT"])
    except ValueError as exc:
        raise EmailError("SMTP_PORT doit être un nombre.") from exc

    message = EmailMessage()
    message["Subject"] = "CV-Gateway Elastic — email de test"
    message["From"] = env["SMTP_FROM"]
    message["To"] = recipient
    message.set_content(
        "Ceci est un email de test envoyé depuis l'écran de configuration de "
        f"CV-Gateway Elastic.\n\nScénario : {scenario_label}\n\n"
        "Si vous recevez ce message, les alertes email pourront être livrées à "
        "cette adresse."
    )

    use_tls = env.get("SMTP_TLS", "true").lower() not in ("0", "false", "no")
    timeout = 20

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as client:
                _authenticate(client, env)
                client.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as client:
                client.ehlo()
                if use_tls:
                    client.starttls(context=ssl.create_default_context())
                    client.ehlo()
                _authenticate(client, env)
                client.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailError(f"Authentification SMTP refusée : {exc.smtp_code}.") from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise EmailError(f"Destinataire refusé par le serveur : {recipient}.") from exc
    except smtplib.SMTPException as exc:
        raise EmailError(f"Erreur SMTP : {exc.__class__.__name__}.") from exc
    except OSError as exc:
        raise EmailError(f"Serveur SMTP injoignable ({host}:{port}) : {exc.strerror or exc}.") from exc

    return {"recipient": recipient, "via": f"{host}:{port}"}


def _authenticate(client, env: dict) -> None:
    user, password = env.get("SMTP_USER"), env.get("SMTP_PASSWORD")
    if user and password:
        client.login(user, password)
