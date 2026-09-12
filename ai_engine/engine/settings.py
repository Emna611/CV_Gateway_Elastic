"""Chargement de config.yaml et exposition des valeurs par défaut."""

import os
from pathlib import Path

import yaml

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.yaml"
ENV_PATH = BASE_DIR / ".env"


def _load_dotenv() -> None:
    """Charge ai_engine/.env sans écraser les variables déjà présentes."""
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, raw = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = raw.strip().strip('"').strip("'")


_load_dotenv()


class ConfigError(RuntimeError):
    pass


def _read() -> dict:
    if not CONFIG_PATH.exists():
        raise ConfigError(f"config.yaml introuvable : {CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ConfigError("config.yaml est vide ou mal formé")
    return data


# Lu une fois au démarrage : le fichier fait partie du déploiement, pas des
# données modifiables à chaud.
CONFIG = _read()


def _dir(key: str, fallback: str) -> Path:
    path = BASE_DIR / CONFIG.get("engine", {}).get(key, fallback)
    path.mkdir(parents=True, exist_ok=True)
    return path


DATA_DIR = _dir("data_dir", "data")
FRAMES_DIR = _dir("frames_dir", "data/frames")
CONFIGS_DIR = _dir("configs_dir", "data/configs")

SOURCE = CONFIG.get("source", {})
ALLOWED_EXTENSIONS = tuple(SOURCE.get("allowed_extensions", [".mp4", ".avi", ".mov"]))
MAX_UPLOAD_BYTES = int(SOURCE.get("max_upload_mb", 1024)) * 1024 * 1024
OPEN_TIMEOUT = float(SOURCE.get("open_timeout_seconds", 12))
RTSP_TRANSPORT = SOURCE.get("rtsp_transport", "tcp")


def laravel_url() -> str:
    return os.environ.get("LARAVEL_URL") or CONFIG.get("laravel", {}).get("url", "http://127.0.0.1:8000")


def ingest_token() -> str:
    return os.environ.get("INGEST_TOKEN", "")


def engine_host() -> str:
    return os.environ.get("ENGINE_HOST") or CONFIG.get("engine", {}).get("host", "127.0.0.1")


def engine_port() -> int:
    raw = os.environ.get("ENGINE_PORT") or CONFIG.get("engine", {}).get("port", 5000)
    return int(raw)


def scenario_ids() -> list:
    return list(CONFIG.get("scenarios", {}).keys())


def scenario_defaults(scenario_id: str) -> dict | None:
    """Valeurs par défaut d'un scénario, telles que déclarées dans config.yaml.

    Renvoie None si le scénario est inconnu, pour que l'API réponde 404 plutôt
    que d'inventer une configuration.
    """
    scenario = CONFIG.get("scenarios", {}).get(scenario_id)
    if not scenario:
        return None

    thresholds = scenario.get("thresholds", {})
    detections = scenario.get("detections", {})

    # « Par défaut : uniquement les critiques » — la sélection email initiale est
    # déduite des sévérités déclarées, pas recopiée à la main dans le frontend.
    critical_types = [
        key for key, spec in thresholds.items() if spec.get("severity") == "critical"
    ]

    return {
        "scenario": scenario_id,
        "label": scenario.get("label", scenario_id),
        "has_zones": bool(scenario.get("has_zones", False)),
        "models": scenario.get("models", []),
        "confidence": scenario.get("confidence", {}),
        "inference": scenario.get("inference", {}),
        "thresholds": thresholds,
        "detections": detections,
        "default_detections": list(detections.keys()),
        "email": {
            "cooldown_minutes": CONFIG.get("email", {}).get("cooldown_minutes", {}),
            "default_types": critical_types,
        },
        "source": {
            "allowed_extensions": list(ALLOWED_EXTENSIONS),
            "max_upload_mb": int(SOURCE.get("max_upload_mb", 1024)),
        },
    }


def active_threshold_keys(defaults: dict, active: list) -> list:
    """Seuils réellement gouvernés par les classes activées."""
    keys = []
    for detection_id in active:
        for key in defaults["detections"].get(detection_id, {}).get("thresholds", []):
            if key in defaults["thresholds"] and key not in keys:
                keys.append(key)
    return keys


def active_model_names(defaults: dict, active: list) -> list:
    """Modèles à charger : union des exigences des classes activées.

    Désactiver la détection du téléphone évite ainsi de charger phone_model.pt.
    """
    names = []
    for detection_id in active:
        for name in defaults["detections"].get(detection_id, {}).get("models", []):
            if name not in names:
                names.append(name)
    return names


def model_specs(defaults: dict, active: list) -> list:
    """Descripteurs complets des modèles à charger, chemins résolus."""
    names = set(active_model_names(defaults, active))
    specs = []
    for model in defaults["models"]:
        if model["name"] not in names:
            continue
        spec = dict(model)
        spec["resolved_path"] = (BASE_DIR / model["path"]).resolve()
        specs.append(spec)
    return specs


def requires_zones(defaults: dict, active: list) -> bool:
    """Le traçage de zones n'est exigé que si une classe active en dépend."""
    return any(
        defaults["detections"].get(detection_id, {}).get("requires_zones")
        for detection_id in active
    )
