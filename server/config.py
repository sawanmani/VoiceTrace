"""
VoiceTrace — server/config.py

Loads config.yaml once at import time. Every other module imports from here.
Satisfies NFR-5: all thresholds and weights are in config.yaml, not hardcoded.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import yaml

# Resolve config path relative to project root (two levels up from this file)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _PROJECT_ROOT / "config.yaml"


def _load() -> Dict[str, Any]:
    if not _CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"config.yaml not found at {_CONFIG_PATH}. "
            "Run from the project root or set VOICETRACE_CONFIG env var."
        )
    path = Path(os.environ.get("VOICETRACE_CONFIG", str(_CONFIG_PATH)))
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


_cfg = _load()

# ── Detection ──────────────────────────────────────────────────────────────
WINDOW_SEC: float = _cfg["detection"]["window_sec"]
STRIDE_SEC: float = _cfg["detection"]["stride_sec"]
SMOOTHING_ALPHA: float = _cfg["detection"]["smoothing_alpha"]
TARGET_SR: int = _cfg["detection"]["target_sr"]
NB_SAMP: int = _cfg["detection"]["nb_samp"]

# ── Liveness ───────────────────────────────────────────────────────────────
SILENCE_THRESHOLD: float = float(_cfg["liveness"]["silence_threshold"])
CLIPPING_THRESHOLD: float = float(_cfg["liveness"]["clipping_threshold"])
CLIPPING_FRACTION_LIMIT: float = float(_cfg["liveness"]["clipping_fraction_limit"])
NOISE_FLOOR_VARIANCE_MIN: float = float(_cfg["liveness"]["noise_floor_variance_min"])
ZCR_MIN: float = float(_cfg["liveness"]["zcr_min"])
ZCR_MAX: float = float(_cfg["liveness"]["zcr_max"])

# ── Risk ───────────────────────────────────────────────────────────────────
THRESHOLD_UNCERTAIN: int = _cfg["risk_thresholds"]["uncertain"]
THRESHOLD_MEDIUM: int = _cfg["risk_thresholds"]["medium"]
THRESHOLD_HIGH: int = _cfg["risk_thresholds"]["high"]
WEIGHTS: Dict[str, float] = _cfg["risk_thresholds"]["weights"]
RECOMMENDATIONS: Dict[str, str] = _cfg["recommendations"]

# ── Server ─────────────────────────────────────────────────────────────────
SERVER_HOST: str = _cfg["server"]["host"]
SERVER_PORT: int = _cfg["server"]["port"]
MAX_CALLS: int = _cfg["server"].get("max_calls", 50)
CORS_ORIGINS: list = _cfg["server"]["cors_origins"]

# ── Logging ────────────────────────────────────────────────────────────────
LOG_LEVEL: str = _cfg["logging"]["level"]
LOG_SCORES: bool = _cfg["logging"]["log_scores"]
LOG_RAW_AUDIO: bool = _cfg["logging"]["log_raw_audio"]  # must remain False

# ── Privacy (DPDP Act data-minimization) ──────────────────────────────────
RETAIN_AUDIO: bool = _cfg.get("privacy", {}).get("retain_audio", False)
RETAIN_FEATURES: bool = _cfg.get("privacy", {}).get("retain_features", False)

# ── WebRTC ─────────────────────────────────────────────────────────────────
WEBRTC_STUN_SERVER: str = _cfg.get("webrtc", {}).get(
    "stun_server", "stun:stun.l.google.com:19302"
)
