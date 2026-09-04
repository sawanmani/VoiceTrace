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
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

import aiofiles
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
from server.signaling import signaling_manager
from server.history_db import get_recent_calls, save_feedback

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
            if path.startswith("/ws/signal/"):
                return await call_next(request)
                
            if not _API_KEY and _is_localhost(client_host):
                return await call_next(request)
            if not _API_KEY:
                return JSONResponse({"detail": "Server API key not configured (fail closed)"}, status_code=500)
                
            # WebSockets from browser cannot easily set custom headers, so we check query params
            key = request.query_params.get("api_key") or request.headers.get("X-Api-Key")
            
            # /ws/twilio is allowed to bypass HTTP auth if it's relying on Twilio signature
            if path.startswith("/ws/twilio"):
                return await call_next(request)
                
            if key != _API_KEY:
                return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)
            return await call_next(request)
        if not _API_KEY and _is_localhost(client_host):
            return await call_next(request)

        if request.url.path.startswith("/rooms/"):
            return await call_next(request)

        if request.url.path.startswith("/twilio/"):
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

    asyncio.create_task(batch_inference_worker())
    from server.audiosocket_server import start_audiosocket_server
    asyncio.create_task(start_audiosocket_server())
    log.info("Startup complete.")

    yield  # Server is running

    log.info("VoiceTrace shutting down...")
    from server.pubsub import broker as _broker
    if hasattr(_broker, "stop"):
        await _broker.stop()


# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VoiceTrace",
    description="Real-time voice cloning detection API",
    version="2.0.0",
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

risk_engine = RiskEngine()
challenge_mgr = ChallengeManager()


# ── Startup warmup (removed — now handled by lifespan above) ─────────────


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
@app.get("/health")
async def health(extended: bool = False):
    if extended:
        from server.health_extended import get_system_status
        return await get_system_status()
        
    from server.pubsub import broker
    from server._model_cache import get_aasist
    active_calls = await broker.get_active_calls()
    model_loaded = get_aasist() is not None
    return HealthResponse(
        status="ok" if model_loaded else "degraded — AASIST checkpoint missing",
        active_calls=active_calls,
        dashboard_subscribers=len(manager.global_subscribers),
        model="AASIST-L" if model_loaded else "not loaded",
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
    """Persist operator feedback label to SQLite for active-learning loop."""
    await save_feedback(req.call_id, req.label)
    log.info("Feedback persisted  call=%s  label=%s", req.call_id, req.label)
    return {"status": "recorded"}


# ── GET /history ────────────────────────────────────────────────────────────
@app.get("/history")
async def history(limit: int = 50):
    """Return the most recent completed calls from SQLite for dashboard hydration."""
    calls = await get_recent_calls(limit=limit)
    return calls


# ── GET /incidents ─────────────────────────────────────────────────────────
@app.get("/incidents")
async def get_incidents():
    """Return all incident reports. Uses aiofiles for non-blocking async reads."""
    from pathlib import Path
    from server.incident_report import _INCIDENT_DIR

    if not _INCIDENT_DIR.exists():
        return []

    incidents = []
    for f in _INCIDENT_DIR.glob("*.json"):
        try:
            async with aiofiles.open(f, "r", encoding="utf-8") as fp:
                content = await fp.read()
                incidents.append(json.loads(content))
        except Exception as e:
            log.warning("Failed to read incident %s: %s", f, e)

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


# ── GET /rooms/{room_id}/exists ───────────────────────────────────────────
@app.get("/rooms/{room_id}/exists")
async def room_exists(room_id: str):
    """
    REST check: does this signaling room exist and have space?
    Used by the Call page to decide whether to show "Join" vs "Room full".
    """
    exists = signaling_manager.room_exists(room_id)
    peers = signaling_manager.peer_count(room_id)
    return {"exists": exists, "peer_count": peers, "full": peers >= 2}


# ── WS /ws/signal/{room_id} ────────────────────────────────────────────────
# NOTE(S1 — consciously deferred): This endpoint intentionally skips API key
# auth. It carries only opaque SDP/ICE candidates — no audio, no PII, no
# call content. The HTTP-level API key middleware does not apply to WS upgrade
# requests. /ws/call and /ws/twilio enforce auth via payload-level
# {"type":"auth","api_key":"..."} on the first frame instead.
# TODO(production): Add JWT/token in the WS upgrade query param or cookie
# before deploying beyond a controlled LAN environment.
@app.websocket("/ws/signal/{room_id}")
async def ws_signal(websocket: WebSocket, room_id: str):
    """
    WebRTC signaling relay for 1:1 in-app calls.

    Protocol:
      1. Client connects. Server joins them to the room.
      2. When both peers are present, server sends {"type":"ready","role":"caller"|"callee"}.
      3. "caller" sends {"type":"offer","sdp":"..."}  → server relays to "callee".
      4. "callee" sends {"type":"answer","sdp":"..."} → server relays to "caller".
      5. Both exchange {"type":"ice-candidate","candidate":{...}} — relayed symmetrically.
      6. Either side sends {"type":"hangup"} to end the session.

    No API key required: this channel carries only opaque WebRTC handshake
    payloads (SDP + ICE) — no audio, no inference data, no PII.
    """
    await websocket.accept()

    joined = await signaling_manager.join(room_id, websocket)
    if not joined:
        await websocket.close(code=1008, reason="Room full (max 2 peers)")
        return

    log.info("ws_signal  room=%s  peer joined", room_id)

    try:
        while True:
            # 30s idle timeout — WebRTC handshake should complete in <5s
            message = await asyncio.wait_for(websocket.receive_text(), timeout=300.0)
            await signaling_manager.relay(room_id, websocket, message)

    except asyncio.TimeoutError:
        log.warning("ws_signal  room=%s  timed out (5min idle)", room_id)
    except WebSocketDisconnect:
        log.info("ws_signal  room=%s  peer disconnected", room_id)
    except Exception as exc:
        log.error("ws_signal  room=%s  error: %s", room_id, exc)
    finally:
        await signaling_manager.leave(room_id, websocket)


# ── POST /twilio/incoming ──────────────────────────────────────────────────
@app.post("/twilio/incoming")
async def twilio_incoming(request: Request):
    """
    Webhook endpoint for Twilio incoming calls.
    Returns TwiML instructing Twilio to stream audio to our WebSocket.

    Fix 3: Optionally validates Twilio request signature when
    TWILIO_VALIDATE_SIGNATURE=true and TWILIO_AUTH_TOKEN are set.
    Gate is off by default so local testing works without a Twilio account.

    Fix 4: wss detection covers ngrok, cloudflared, Railway, Render.
    """
    # Fix 3 — Twilio signature validation (env-gated)
    _validate_sig = os.getenv("TWILIO_VALIDATE_SIGNATURE", "false").lower() == "true"
    if _validate_sig:
        _auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        if not _auth_token:
            raise HTTPException(status_code=500, detail="TWILIO_AUTH_TOKEN not configured")
        try:
            from twilio.request_validator import RequestValidator
            validator = RequestValidator(_auth_token)
            signature = request.headers.get("X-Twilio-Signature", "")
            url = str(request.url)
            form = dict(await request.form())
            if not validator.validate(url, form, signature):
                log.warning("twilio_incoming  invalid Twilio signature from %s", request.client)
                raise HTTPException(status_code=403, detail="Invalid Twilio signature")
        except ImportError:
            log.error("twilio_incoming  TWILIO_VALIDATE_SIGNATURE=true but 'twilio' package not installed")
            raise HTTPException(status_code=500, detail="twilio package required for signature validation")

    host = request.headers.get("host", "localhost:8000")
    scheme = request.headers.get("x-forwarded-proto", "http")
    # Fix 4 — detect wss for all common tunnel/hosting providers
    _wss_hosts = ("ngrok", "trycloudflare", "railway", "render", "fly.io", "herokuapp")
    ws_scheme = "wss" if (
        scheme == "https" or any(h in host for h in _wss_hosts)
    ) else "ws"
    stream_url = f"{ws_scheme}://{host}/ws/twilio"

    # Fix 2 — Use <Connect><Stream> instead of <Start>+<Pause length="60">.
    # <Connect> keeps the call alive for the stream's duration (no hard timeout).
    # <Start>+<Pause length="60"> was hanging up calls after 60 seconds.
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>VoiceTrace active. This call is being monitored for AI voice cloning.</Say>
  <Connect>
    <Stream url="{stream_url}" />
  </Connect>
</Response>"""
    from fastapi import Response as FastAPIResponse
    return FastAPIResponse(content=twiml, media_type="application/xml")


# ── WS /ws/twilio ─────────────────────────────────────────────────────────
@app.websocket("/ws/twilio")
async def ws_twilio(websocket: WebSocket):
    await websocket.accept()
    # Twilio does not send custom JSON auth payloads. In production, 
    # use HTTP Basic Auth in the TwiML URL or Twilio Signature validation.

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
