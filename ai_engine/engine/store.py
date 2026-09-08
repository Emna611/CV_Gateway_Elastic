"""Validation et persistance de la configuration d'un scénario.

La persistance définitive (Laravel) arrive en phase 5. En attendant, la
configuration validée est écrite en JSON dans data/configs/ afin que
« Enregistrer » ait un effet réel et rechargeable.
"""

import json
import re
from typing import Any

from . import settings

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")


class ValidationError(ValueError):
    """Configuration refusée, avec un message destiné à l'utilisateur."""


def _number(value: Any, spec: dict, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"{label} : valeur numérique attendue.")
    low, high = spec.get("min"), spec.get("max")
    if low is not None and value < low:
        raise ValidationError(f"{label} : {value} est en dessous du minimum {low}.")
    if high is not None and value > high:
        raise ValidationError(f"{label} : {value} dépasse le maximum {high}.")
    return value


def _validate_zones(raw: Any) -> list:
    """Contrôle que les polygones sont bien normalisés en 0..1.

    Le stockage en pixels casserait la configuration au moindre changement de
    résolution : la règle est donc vérifiée côté serveur, pas seulement dans
    l'éditeur de zones.
    """
    if raw in (None, ""):
        return []
    if not isinstance(raw, list):
        raise ValidationError("zones : liste attendue.")

    zones = []
    seen_ids = set()
    for index, zone in enumerate(raw, start=1):
        if not isinstance(zone, dict):
            raise ValidationError(f"zones[{index}] : objet attendu.")

        zone_id = str(zone.get("id") or f"zone_{index}")
        if zone_id in seen_ids:
            raise ValidationError(f"zones : identifiant en doublon ({zone_id}).")
        seen_ids.add(zone_id)

        polygon = zone.get("polygon")
        if not isinstance(polygon, list) or len(polygon) < 3:
            raise ValidationError(f"{zone_id} : un polygone exige au moins 3 sommets.")

        points = []
        for point in polygon:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValidationError(f"{zone_id} : chaque sommet doit être une paire [x, y].")
            x, y = point
            if isinstance(x, bool) or isinstance(y, bool):
                raise ValidationError(f"{zone_id} : coordonnées invalides.")
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                raise ValidationError(f"{zone_id} : coordonnées non numériques.")
            if not (0.0 <= x <= 1.0) or not (0.0 <= y <= 1.0):
                raise ValidationError(
                    f"{zone_id} : coordonnées hors bornes ({x}, {y}). "
                    "Les zones doivent être normalisées entre 0 et 1, jamais en pixels."
                )
            points.append([round(float(x), 6), round(float(y), 6)])

        zones.append(
            {
                "id": zone_id,
                "name": str(zone.get("name") or f"Poste {index}").strip()[:60],
                "polygon": points,
            }
        )
    return zones


def validate(scenario_id: str, payload: dict) -> dict:
    """Valide une configuration complète contre les bornes de config.yaml."""
    defaults = settings.scenario_defaults(scenario_id)
    if defaults is None:
        raise ValidationError(f"Scénario inconnu : {scenario_id}")
    if not isinstance(payload, dict):
        raise ValidationError("Corps de requête JSON attendu.")

    # ── source ──
    source = payload.get("source") or {}
    source_type = source.get("type")
    if source_type not in ("file", "youtube", "rtsp"):
        raise ValidationError("source.type doit valoir file, youtube ou rtsp.")
    source_value = str(source.get("value") or "").strip()
    if not source_value:
        raise ValidationError("source.value est vide.")

    # ── classes détectées ──
    declared = defaults["detections"]
    raw_detections = payload.get("detections", defaults["default_detections"])
    if not isinstance(raw_detections, list):
        raise ValidationError("detections : liste attendue.")

    unknown_detections = set(raw_detections) - set(declared)
    if unknown_detections:
        raise ValidationError(
            f"Classes inconnues pour {scenario_id} : {', '.join(sorted(unknown_detections))}"
        )
    # Ordre du YAML conservé, doublons écartés.
    detections = [key for key in declared if key in set(raw_detections)]
    if not detections:
        raise ValidationError("Activez au moins une classe à détecter.")

    for detection_id in detections:
        missing = [
            required
            for required in declared[detection_id].get("requires", [])
            if required not in detections
        ]
        if missing:
            labels = ", ".join(declared[required]["label"] for required in missing)
            raise ValidationError(
                f"« {declared[detection_id]['label']} » exige aussi : {labels}."
            )

    active_thresholds = settings.active_threshold_keys(defaults, detections)

    # ── seuils ──
    specs = defaults["thresholds"]
    raw_thresholds = payload.get("thresholds") or {}
    if not isinstance(raw_thresholds, dict):
        raise ValidationError("thresholds : objet attendu.")
    unknown = set(raw_thresholds) - set(specs)
    if unknown:
        raise ValidationError(f"Seuils inconnus pour {scenario_id} : {', '.join(sorted(unknown))}")

    thresholds = {}
    for key, spec in specs.items():
        value = raw_thresholds.get(key, spec.get("default"))
        thresholds[key] = _number(value, spec, spec.get("label", key))

    # ── confiance ──
    confidence = _number(
        payload.get("confidence", defaults["confidence"].get("default")),
        defaults["confidence"],
        "Confiance du modèle",
    )

    # ── email ──
    raw_email = payload.get("email") or {}
    if not isinstance(raw_email, dict):
        raise ValidationError("email : objet attendu.")
    enabled = bool(raw_email.get("enabled", False))
    recipient = str(raw_email.get("recipient") or "").strip()
    if enabled and not EMAIL_RE.match(recipient):
        raise ValidationError("email.recipient : adresse invalide.")

    # Sélection par défaut restreinte aux classes actives : sans cela, activer
    # « téléphone » seul refuserait la configuration à cause du défaut SLEEPING.
    raw_types = raw_email.get("types")
    types = (
        [key for key in defaults["email"]["default_types"] if key in active_thresholds]
        if raw_types is None
        else raw_types
    )
    if not isinstance(types, list):
        raise ValidationError("email.types : liste attendue.")
    unknown_types = set(types) - set(specs)
    if unknown_types:
        raise ValidationError(
            f"email.types contient des événements inconnus : {', '.join(sorted(unknown_types))}"
        )
    # Un événement dont la classe est désactivée ne sera jamais produit :
    # l'accepter reviendrait à promettre un email impossible.
    inactive_types = [key for key in types if key not in active_thresholds]
    if inactive_types:
        labels = ", ".join(specs[key]["label"] for key in inactive_types)
        raise ValidationError(
            f"email.types porte sur des classes désactivées : {labels}."
        )
    if enabled and not types:
        raise ValidationError("email.types : sélectionnez au moins un type d'événement.")

    cooldown = _number(
        raw_email.get("cooldown_minutes", defaults["email"]["cooldown_minutes"].get("default")),
        defaults["email"]["cooldown_minutes"],
        "Délai anti-spam",
    )

    # ── zones ──
    zones = _validate_zones(payload.get("zones"))
    if not defaults["has_zones"] and zones:
        raise ValidationError(f"Le scénario {scenario_id} n'accepte pas de zones.")

    return {
        "scenario": scenario_id,
        "source": {"type": source_type, "value": source_value},
        "detections": detections,
        "models": settings.active_model_names(defaults, detections),
        "requires_zones": settings.requires_zones(defaults, detections),
        "zones": zones,
        "thresholds": thresholds,
        "confidence": confidence,
        "email": {
            "enabled": enabled,
            "recipient": recipient,
            "types": list(types),
            "cooldown_minutes": cooldown,
        },
    }


def _path(scenario_id: str):
    return settings.CONFIGS_DIR / f"{scenario_id}.json"


def save(scenario_id: str, config: dict) -> None:
    with _path(scenario_id).open("w", encoding="utf-8") as handle:
        json.dump(config, handle, ensure_ascii=False, indent=2)


def load(scenario_id: str) -> dict | None:
    path = _path(scenario_id)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None
