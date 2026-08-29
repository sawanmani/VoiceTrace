"""
VoiceTrace — server/main.py

FastAPI application entry point.
Thin orchestrator: routes, auth middleware, startup warmup.
All business logic delegated to dedicated modules.

Architecture:
  - /health           → liveness check
  - /analyze          → file-based inference (POST)
  - /feedback         → active learning label endpoint (POST)
  - /ws/call/{id}     → bidirectional browser WebSocket (audio in, events out)
  - /ws/score         → dashboard subscriber (events only)
  - /ws/twilio        → Twilio Media Streams bridge
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid

import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from server.audio_utils import bytes_to_pcm, decode_twilio_chunk, file_bytes_to_pcm
from server.config import CORS_ORIGINS, LOG_LEVEL, LOG_SCORES
from server.risk_engine import CallContext, RiskEngine
from server.connection_manager import manager
from server.schemas import (
    HealthResponse, AnalyzeResponse,
    ContextUpdateMessage, ChallengeAudioMessage, FeedbackRequest,
)
from server.challenge import ChallengeManager, build_challenge_pool
from server.incident_report import generate_incident_report

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("voicetrace")


# ── API-Key Middleware (Fix 4) ─────────────────────────────────────────────
_API_KEY = os.getenv("VOICETRACE_API_KEY", "")   # empty string → auth disabled in dev

class ApiKeyMiddleware(BaseHTTPMiddleware):
    """
    Require X-Api-Key header on all non-WebSocket requests when VOICETRACE_API_KEY is set.
    WebSocket auth is handled inside each ws_* handler via the query param ?api_key=.
    """
    async def dispatch(self, request: Request, call_next):
        if not _API_KEY:
            return await call_next(request)  # auth disabled in dev/demo mode

        # Skip OPTIONS / health checks for easy monitoring
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)

        # WebSocket connections — checked separately in the handler
        if request.url.path.startswith("/ws/"):
            return await call_next(request)

        key = request.headers.get("X-Api-Key") or request.query_params.get("api_key")
        if key != _API_KEY:
            return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)

        return await call_next(request)


def _verify_ws_key(websocket: WebSocket) -> bool:
    """Check API key on WebSocket connections."""
    if not _API_KEY:
        return True
    key = websocket.query_params.get("api_key", "")
    return key == _API_KEY


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VoiceTrace",
    description="Real-time voice cloning detection API",
    version="2.0.0",
)

app.add_middleware(ApiKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

risk_engine = RiskEngine()
challenge_mgr = ChallengeManager()   # Stateless — safe to share across calls


# ── Startup warmup (Fix 3) ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    log.info("VoiceTrace starting up...")

    # Run heavy model loads in executor so the event loop stays unblocked
    loop = asyncio.get_running_loop()

    # Warm up all ML models (AASIST-L, ASR, ECAPA-TDNN)
    from server._model_cache import warmup_all  # noqa: PLC0415
    await loop.run_in_executor(None, warmup_all)

    # Build challenge audio pool in subprocess-isolated manner
    await loop.run_in_executor(None, build_challenge_pool)

    # Start Redis pubsub listener if configured
    from server.pubsub import broker  # noqa: PLC0415
    if hasattr(broker, "start"):
        await broker.start()

    log.info("Startup complete.")


# ── Shared processing helper ───────────────────────────────────────────────
async def _process_audio_chunk(
    audio_chunk: np.ndarray,
    detector,
    call_id: str,
    context: CallContext,
) -> None:
    """Run inference and broadcast the event. Generates incident report if high-risk."""
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, detector.push, audio_chunk)
    if not results:
        return

    for result in results:
        event = risk_engine.score(result, call_id, context)

        if LOG_SCORES:
            log.info(
                "process  call=%s  window=%d  risk=%d  band=%s  latency=%.1fms",
                call_id, event.window_index, event.risk_score,
                event.band, event.latency_ms,
            )

        if event.band == "high":
            from server.incident_report import generate_incident_report
            try:
                await generate_incident_report(call_id, [event.to_dict()])
            except Exception as exc:
                log.error("Incident report failed: %s", exc)

        await manager.broadcast(call_id, event.to_dict())


# ── GET /health ────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    from server.pubsub import broker
    active_calls = await broker.get_active_calls()
    return HealthResponse(
        status="ok",
        active_calls=active_calls,
        dashboard_subscribers=len(manager.global_subscribers),
        model="AASIST-L",
    )


# ── POST /analyze ──────────────────────────────────────────────────────────
@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        audio = file_bytes_to_pcm(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not decode audio: {exc}")

    call_id = f"analyze-{uuid.uuid4().hex[:8]}"

    from detector.streaming import StreamingDetector  # noqa: PLC0415
    detector = StreamingDetector()

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, detector.push_full, audio)

    if not results:
        raise HTTPException(status_code=422, detail="Audio too short — need at least 1 second")

    events = [risk_engine.score(r, call_id).to_dict() for r in results]

    if LOG_SCORES:
        log.info(
            "analyze  call=%s  windows=%d  peak_risk=%d",
            call_id, len(events), max(e["risk_score"] for e in events),
        )

    return AnalyzeResponse(call_id=call_id, windows=events)


# ── POST /feedback ─────────────────────────────────────────────────────────
@app.post("/feedback")
async def feedback(req: FeedbackRequest):
    """Active learning label endpoint. In prod, queues (call_id, label) for retraining."""
    log.info("Feedback  call=%s  label=%s", req.call_id, req.label)
    return {"status": "recorded"}


# ── WS /ws/call/{call_id} ─────────────────────────────────────────────────
@app.websocket("/ws/call/{call_id}")
async def ws_call(websocket: WebSocket, call_id: str):
    # Fix 4: Auth check
    if not _verify_ws_key(websocket):
        await websocket.close(code=1008, reason="Unauthorized")
        return

    try:
        detector = await manager.connect_call(call_id, websocket)
    except RuntimeError as exc:
        log.warning("ws_call  %s", exc)
        return

    context = CallContext()
    active_challenge_code: str | None = None
    challenge_buffer: list[float] = []

    log.info("ws_call  call=%s  connected", call_id)

    try:
        while True:
            message = await websocket.receive()

            # ── Text frame: control messages ──────────────────────────────
            if message.get("text"):
                try:
                    ctrl = ContextUpdateMessage.model_validate_json(message["text"])
                except ValidationError:
                    continue

                if ctrl.type == "context":
                    if ctrl.caller_familiarity is not None:
                        context.caller_familiarity = ctrl.caller_familiarity
                    if ctrl.transaction_risk is not None:
                        context.transaction_risk = ctrl.transaction_risk

                elif ctrl.type == "trigger_challenge":
                    log.info("ws_call  call=%s  triggering challenge", call_id)
                    # Pick from pre-rendered pool — no blocking TTS on event loop
                    chal = challenge_mgr.pick_challenge()
                    if chal is None:
                        log.error("Challenge pool empty — cannot trigger challenge")
                        continue

                    b64 = challenge_mgr.encode_challenge_b64(chal)
                    await websocket.send_text(
                        ChallengeAudioMessage(
                            type="challenge_audio",
                            audio_b64=b64,
                            prompt=chal["prompt"],
                        ).model_dump_json()
                    )
                    active_challenge_code = chal["expected_text"]
                    challenge_buffer = []

                continue

            # ── Binary frame: audio PCM ───────────────────────────────────
            if message.get("bytes"):
                raw = message["bytes"]
                try:
                    audio_chunk, _ = bytes_to_pcm(raw)
                except Exception as exc:
                    log.debug("ws_call  call=%s  bad audio frame: %s", call_id, exc)
                    continue

                # Challenge response collection
                if active_challenge_code:
                    challenge_buffer.extend(audio_chunk.tolist())
                    if len(challenge_buffer) >= 4 * 16000:
                        resp_audio = np.array(challenge_buffer, dtype=np.float32)
                        loop = asyncio.get_running_loop()
                        passed = await loop.run_in_executor(
                            None, challenge_mgr.verify_response,
                            active_challenge_code, resp_audio,
                        )
                        if passed:
                            log.info("ws_call  call=%s  challenge PASSED", call_id)
                        else:
                            log.warning("ws_call  call=%s  challenge FAILED — spiking risk", call_id)
                            context.transaction_risk = 1.0

                        # Fix 5: Always clear state regardless of pass/fail
                        active_challenge_code = None
                        challenge_buffer.clear()

                await _process_audio_chunk(audio_chunk, detector, call_id, context)


    except WebSocketDisconnect:
        log.info("ws_call  call=%s  disconnected", call_id)
    except Exception as exc:
        log.error("ws_call  call=%s  unexpected error: %s", call_id, exc)
    finally:
        # Fix 5: Aggressive cleanup — always runs even on unexpected disconnect mid-challenge
        active_challenge_code = None
        challenge_buffer.clear()
        await manager.disconnect_call(call_id, websocket)
        log.debug("ws_call  call=%s  cleaned up", call_id)


# ── WS /ws/score ───────────────────────────────────────────────────────────
@app.websocket("/ws/score")
async def ws_score(websocket: WebSocket):
    if not _verify_ws_key(websocket):
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await manager.connect_global(websocket)
    log.info("ws_score  dashboard connected")
    try:
        while True:
            try:
                await websocket.receive_text()
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_global(websocket)
        log.info("ws_score  dashboard disconnected")


# ── WS /ws/twilio ─────────────────────────────────────────────────────────
@app.websocket("/ws/twilio")
async def ws_twilio(websocket: WebSocket):
    if not _verify_ws_key(websocket):
        await websocket.close(code=1008, reason="Unauthorized")
        return

    await websocket.accept()
    call_id = f"twilio-{uuid.uuid4().hex[:8]}"
    from detector.streaming import StreamingDetector  # noqa: PLC0415
    detector = StreamingDetector()
    log.info("ws_twilio  call=%s  connected", call_id)

    try:
        while True:
            try:
                raw = await websocket.receive_text()
                event = json.loads(raw)
            except Exception:
                continue

            event_type = event.get("event", "")

            if event_type == "start":
                # Twilio nests streamSid inside event["start"], not top-level
                sid = event.get("start", {}).get("streamSid") or event.get("streamSid")
                if sid:
                    call_id = sid
                log.info("ws_twilio  call=%s  stream started", call_id)
            elif event_type == "media":
                payload_b64 = event.get("media", {}).get("payload", "")
                if not payload_b64:
                    continue
                try:
                    loop = asyncio.get_running_loop()
                    audio_chunk = await loop.run_in_executor(
                        None, decode_twilio_chunk, payload_b64
                    )
                    await _process_audio_chunk(audio_chunk, detector, call_id, CallContext())
                except Exception as exc:
                    log.warning("ws_twilio  call=%s  error: %s", call_id, exc)
            elif event_type == "stop":
                break
    except WebSocketDisconnect:
        log.info("ws_twilio  call=%s  disconnected", call_id)
    finally:
        detector.reset()
        # Twilio endpoints don't use ConnectionManager's subscribers by default, but let's be safe
        try:
            await manager.disconnect_call(call_id, websocket)
        except Exception:
            pass
        log.debug("ws_twilio  call=%s  cleaned up", call_id)
