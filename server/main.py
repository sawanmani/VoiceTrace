"""
VoiceTrace — server/main.py

FastAPI application entry point.
Thin orchestrator: routes, auth middleware, startup warmup.
All business logic delegated to dedicated modules.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from server.config import CORS_ORIGINS, LOG_LEVEL
from server.connection_manager import manager
from server.challenge import build_challenge_pool
from server.batch_worker import batch_inference_worker

from server.limiter import limiter
from server.middleware import ApiKeyMiddleware
from server.routers import auth, system, analysis, telephony, websockets

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("voicetrace")

# ── Lifespan (replaces deprecated @app.on_event) ─────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle using modern FastAPI lifespan API."""
    log.info("VoiceTrace starting up...")
    loop = asyncio.get_running_loop()

    from server.history_db import init_db
    await init_db()

    from server._model_cache import warmup_all
    await loop.run_in_executor(None, warmup_all)

    # Build challenge pool in background — don't block server startup
    loop.run_in_executor(None, build_challenge_pool)

    from server.pubsub import broker
    if hasattr(broker, "start"):
        await broker.start()

    async def _run_batch_worker_with_restart():
        """
        Restart batch_inference_worker on unexpected crash with exponential backoff.
        Fix H2: without this, a crash silently stops all inference with no alert.
        """
        backoff = 1.0
        max_backoff = 60.0
        while True:
            try:
                log.info("Batch worker starting (backoff=%.0fs)", backoff)
                await batch_inference_worker()
                # If worker returns normally, just restart immediately
            except asyncio.CancelledError:
                log.info("Batch worker cancelled — shutting down cleanly")
                return
            except Exception as exc:
                log.critical(
                    "BATCH WORKER CRASHED: %s — restarting in %.0fs",
                    exc, backoff, exc_info=True,
                )
                # Fire alert so operators know inference has stopped
                try:
                    from server.alert_dispatcher import dispatch_alert
                    await dispatch_alert(
                        "SYSTEM",
                        {
                            "risk_score": 100,
                            "band": "high",
                            "signals": {},
                            "recommendation": (
                                f"SYSTEM ALERT: Batch inference worker crashed. "
                                f"No detection running. Error: {exc}. "
                                f"Restarting in {backoff:.0f}s."
                            ),
                        },
                    )
                except Exception:
                    pass  # Don't let alert failure prevent restart
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, max_backoff)

    _batch_task = asyncio.create_task(_run_batch_worker_with_restart())
    from server.audiosocket_server import start_audiosocket_server
    _audio_task = asyncio.create_task(start_audiosocket_server())
    log.info("Startup complete.")

    yield  # Server is running

    log.info("VoiceTrace shutting down...")

    # Cancel background workers
    _batch_task.cancel()
    _audio_task.cancel()
    try:
        await asyncio.gather(_batch_task, _audio_task, return_exceptions=True)
    except Exception:
        pass

    # Close all active WebSocket connections gracefully
    for ws in list(manager.global_subscribers):
        try:
            await ws.close(code=1001, reason="Server shutting down")
        except Exception:
            pass
    manager.global_subscribers.clear()

    from server.pubsub import broker as _broker
    if hasattr(_broker, "stop"):
        await _broker.stop()

    # Close alert dispatcher HTTP client (Fix M7) — prevents resource leak warnings
    try:
        from server.alert_dispatcher import get_client
        _alert_client = get_client()
        if _alert_client:
            await _alert_client.aclose()
            log.info("Alert dispatcher HTTP client closed")
    except Exception as _e:
        log.warning("Failed to close alert HTTP client: %s", _e)

    log.info("Shutdown complete.")


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VoiceTrace API",
    description="Real-time open-source AI voice cloning detection, built for the Smart India Hackathon.",
    version="2.0.0",
    contact={
        "name": "VoiceTrace Team",
        "url": "https://github.com/voicetrace/voicetrace",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=[
        {"name": "Authentication", "description": "API Key management and validation."},
        {"name": "Analysis", "description": "Audio analysis and spoof detection endpoints."},
        {"name": "Telephony", "description": "SIP/Asterisk integrations and call management."},
        {"name": "System", "description": "Health checks and system status."},
        {"name": "WebSockets", "description": "Real-time bidirectional streaming."},
    ],
    lifespan=lifespan,
)

app.add_middleware(ApiKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate Limiting (Fix H1) ────────────────────────────────────────────────
# Per-IP sliding-window limits for REST endpoints.
# WebSocket per-IP limits are enforced in ConnectionManager.connect_call().
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(system.router)
app.include_router(analysis.router)
app.include_router(telephony.router)
app.include_router(websockets.router)
