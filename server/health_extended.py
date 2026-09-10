"""
VoiceTrace — server/health_extended.py

Extended health check returning detailed system status.
"""
from __future__ import annotations

import asyncio
import platform
import time
from datetime import datetime, timezone

_start_time = time.monotonic()


async def get_system_status() -> dict:
    """Return detailed system health for /health?extended=true."""
    from server._model_cache import get_aasist, get_asr_model, get_spk_model
    from server.pubsub import broker
    from server.connection_manager import manager
    from server.call_manager import call_manager

    uptime_sec = time.monotonic() - _start_time
    active_calls = await broker.get_active_calls()

    models = {
        "aasist_l": "loaded" if get_aasist() is not None else "not loaded",
        "asr_crdnn": "loaded" if get_asr_model() is not None else "not loaded",
        "ecapa_tdnn_speaker": "loaded" if get_spk_model() is not None else "not loaded",
    }

    try:
        import psutil
        proc = psutil.Process()
        memory_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
        cpu_percent = proc.cpu_percent(interval=None)
    except ImportError:
        import os
        memory_mb = None
        cpu_percent = None

    try:
        import torch
        gpu_available = False
        gpu_name = None if gpu_available else None
    except Exception:
        gpu_available = False
        gpu_name = None

    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(uptime_sec, 1),
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "models": models,
        "active_calls": active_calls,
        "dashboard_subscribers": len(manager.global_subscribers),
        "call_registry_size": len(call_manager.active_calls),
        "memory_mb": memory_mb,
        "cpu_percent": cpu_percent,
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
    }
