"""
VoiceTrace — server/main.py

FastAPI application entry point.
Thin orchestrator: routes, auth middleware, startup warmup.
All business logic delegated to dedicated modules.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

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
from server.call_manager import call_manager
from server.schemas import (
    HealthResponse, AnalyzeResponse,
    ContextUpdateMessage, ChallengeAudioMessage, FeedbackRequest,
)
from server.challenge import ChallengeManager, build_challenge_pool
from server.batch_worker import batch_inference_worker

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("voicetrace")


# ── API-Key Middleware (Fix 4) ─────────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv()
_API_KEY = os.getenv("VOICETRACE_API_KEY", "")


def _is_localhost(host: str | None) -> bool:
    if not host:
        return False
    normalized = host.split(":", 1)[0].lower()
    return normalized in {"localhost", "127.0.0.1", "::1"}


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        client_host = request.client.host if request.client else None

        if request.method == "OPTIONS":
            return await call_next(request)

        if path in {"/", "/health", "/docs", "/openapi.json", "/redoc"}:
            return await call_next(request)

        if path.startswith("/ws/"):
            if not _API_KEY and _is_localhost(client_host):
                return await call_next(request)
            if not _API_KEY:
                return JSONResponse({"detail": "Server API key not configured (fail closed)"}, status_code=500)
            key = request.headers.get("X-Api-Key")
            if key != _API_KEY:
                return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)
            return await call_next(request)

        if not _API_KEY and _is_localhost(client_host):
            return await call_next(request)

        if not _API_KEY:
            return JSONResponse({"detail": "Server API key not configured (fail closed)"}, status_code=500)

        key = request.headers.get("X-Api-Key")
        if key != _API_KEY:
            return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)

        return await call_next(request)


async def _verify_ws_key_payload(websocket: WebSocket) -> bool:
    """Check API key from initial WebSocket auth payload or query param."""
    host = (websocket.headers.get("host") or "").split(":", 1)[0].lower()
    if not _API_KEY and _is_localhost(host):
        return True

    if not _API_KEY:
        await websocket.close(code=1011, reason="Server API key not configured")
        return False

    query_key = websocket.query_params.get("api_key")
    if query_key == _API_KEY:
        return True

    try:
        message = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        data = json.loads(message)
        if isinstance(data, dict) and data.get("type") == "auth" and data.get("api_key") == _API_KEY:
            return True
    except Exception:
        pass

    await websocket.close(code=1008, reason="Unauthorized")
    return False


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
challenge_mgr = ChallengeManager()


# ── Startup warmup (Fix 3) ─────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    log.info("VoiceTrace starting up...")
    loop = asyncio.get_running_loop()

    from server._model_cache import warmup_all  # noqa: PLC0415
    await loop.run_in_executor(None, warmup_all)

    await loop.run_in_executor(None, build_challenge_pool)

    from server.pubsub import broker  # noqa: PLC0415
    if hasattr(broker, "start"):
        await broker.start()
        
    # Start the dynamic batching worker
    asyncio.create_task(batch_inference_worker())

    log.info("Startup complete.")

@app.on_event("shutdown")
async def shutdown():
    log.info("VoiceTrace shutting down...")
    from server.pubsub import broker
    if hasattr(broker, "stop"):
        await broker.stop()


# ── GET / ───────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "VoiceTrace",
        "docs": "/docs",
        "health": "/health",
    }


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
        log.warning(f"Audio decode failed: {exc}")
        raise HTTPException(status_code=422, detail="Invalid audio format")

    call_id = f"analyze-{uuid.uuid4().hex[:8]}"

    from detector.streaming import StreamingDetector  # noqa: PLC0415
    detector = StreamingDetector()

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, detector.push_full, audio)

    if not results:
        raise HTTPException(status_code=422, detail="Audio too short — need at least 1 second")

    events = [risk_engine.score(r, call_id).to_dict() for r in results]

    return AnalyzeResponse(call_id=call_id, windows=events)


# ── POST /feedback ─────────────────────────────────────────────────────────
@app.post("/feedback")
async def feedback(req: FeedbackRequest):
    log.info("Feedback  call=%s  label=%s", req.call_id, req.label)
    return {"status": "recorded"}


# ── GET /incidents ─────────────────────────────────────────────────────────
@app.get("/incidents")
async def get_incidents():
    from pathlib import Path
    import json
    
    incident_dir = Path("incidents")
    if not incident_dir.exists():
        return []
    
    incidents = []
    for f in incident_dir.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fp:
                incidents.append(json.load(fp))
        except Exception as e:
            log.warning(f"Failed to read incident {f}: {e}")
            
    # Sort descending by timestamp
    incidents.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return incidents


# ── WS /ws/call/{call_id} ─────────────────────────────────────────────────
@app.websocket("/ws/call/{call_id}")
async def ws_call(websocket: WebSocket, call_id: str):
    await websocket.accept()
    if not await _verify_ws_key_payload(websocket):
        return

    try:
        detector = await manager.connect_call(call_id, websocket)
    except RuntimeError as exc:
        log.warning("ws_call  %s", exc)
        return

    state = call_manager.get_state(call_id)
    if not state:
        return
    context = state.context
    
    active_challenge_code: str | None = None
    challenge_buffer: list[np.ndarray] = []

    log.info("ws_call  call=%s  connected", call_id)

    try:
        while True:
            # 60s idle timeout to prevent memory leaks from half-open TCP connections
            message = await asyncio.wait_for(websocket.receive(), timeout=60.0)

            if message.get("text"):
                try:
                    ctrl = ContextUpdateMessage.model_validate_json(message["text"])
                except ValidationError as e:
                    await websocket.send_json({"error": "Invalid message format", "details": e.errors()})
                    continue

                if ctrl.type == "context":
                    if ctrl.caller_familiarity is not None:
                        context.caller_familiarity = ctrl.caller_familiarity
                    if ctrl.transaction_risk is not None:
                        context.transaction_risk = ctrl.transaction_risk

                elif ctrl.type == "trigger_challenge":
                    chal = challenge_mgr.pick_challenge()
                    if chal is None:
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

            if message.get("bytes"):
                raw = message["bytes"]
                try:
                    audio_chunk, _ = bytes_to_pcm(raw)
                except Exception:
                    continue

                if active_challenge_code:
                    challenge_buffer.append(audio_chunk)
                    total_len = sum(len(c) for c in challenge_buffer)
                    MAX_CHALLENGE_BUFFER_SIZE = 5 * 16000
                    if total_len > MAX_CHALLENGE_BUFFER_SIZE:
                        log.warning("ws_call  call=%s  challenge buffer overflow", call_id)
                        context.transaction_risk = 1.0
                        active_challenge_code = None
                        challenge_buffer.clear()
                    elif total_len >= 4 * 16000:
                        resp_audio = np.concatenate(challenge_buffer)
                        loop = asyncio.get_running_loop()
                        passed = await loop.run_in_executor(
                            None, challenge_mgr.verify_response,
                            active_challenge_code, resp_audio,
                        )
                        if not passed:
                            context.transaction_risk = 1.0
                        active_challenge_code = None
                        challenge_buffer.clear()

                # Push to buffer, BatchWorker handles inference!
                detector.push(audio_chunk)

    except asyncio.TimeoutError:
        log.warning("ws_call  call=%s  timed out (no data for 60s)", call_id)
    except WebSocketDisconnect:
        log.info("ws_call  call=%s  disconnected", call_id)
    except Exception as exc:
        log.error("ws_call  call=%s  error: %s", call_id, exc)
    finally:
        active_challenge_code = None
        challenge_buffer.clear()
        await manager.disconnect_call(call_id, websocket)


# ── WS /ws/score ───────────────────────────────────────────────────────────
@app.websocket("/ws/score")
async def ws_score(websocket: WebSocket):
    await websocket.accept()
    if not await _verify_ws_key_payload(websocket):
        return

    await manager.connect_global(websocket)
    log.info("ws_score  dashboard connected")
    try:
        while True:
            # 60s idle timeout (Dashboard should send pings if needed)
            await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
    except asyncio.TimeoutError:
        log.warning("ws_score  timed out")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error(f"ws_score  error: {e}")
    finally:
        manager.disconnect_global(websocket)
        log.info("ws_score  dashboard disconnected")


# ── WS /ws/twilio ─────────────────────────────────────────────────────────
@app.websocket("/ws/twilio")
async def ws_twilio(websocket: WebSocket):
    await websocket.accept()
    if not await _verify_ws_key_payload(websocket):
        return

    call_id = f"twilio-{uuid.uuid4().hex[:8]}"
    try:
        detector = await manager.connect_call(call_id, websocket)
    except RuntimeError as exc:
        log.warning("ws_twilio  %s", exc)
        return
        
    log.info("ws_twilio  call=%s  connected", call_id)

    try:
        while True:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            try:
                event = json.loads(raw)
            except Exception:
                continue

            event_type = event.get("event", "")

            if event_type == "start":
                sid = event.get("start", {}).get("streamSid") or event.get("streamSid")
                if not sid:
                    await websocket.close(code=1008, reason="Missing streamSid")
                    return
                log.info("ws_twilio  call=%s  stream started", call_id)
            elif event_type == "media":
                payload_b64 = event.get("media", {}).get("payload", "")
                if not payload_b64:
                    continue
                try:
                    loop = asyncio.get_running_loop()
                    audio_chunk = await loop.run_in_executor(None, decode_twilio_chunk, payload_b64)
                    detector.push(audio_chunk)
                except Exception as exc:
                    log.warning("ws_twilio  call=%s  error: %s", call_id, exc)
            elif event_type == "stop":
                break
    except asyncio.TimeoutError:
        log.warning("ws_twilio  call=%s  timed out", call_id)
    except WebSocketDisconnect:
        log.info("ws_twilio  call=%s  disconnected", call_id)
    finally:
        await manager.disconnect_call(call_id, websocket)
