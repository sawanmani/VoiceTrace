from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from server.audio_utils import bytes_to_pcm, decode_twilio_chunk, file_bytes_to_pcm
from server.config import CORS_ORIGINS, LOG_LEVEL, LOG_SCORES
from server.risk_engine import CallContext, RiskEngine
from server.connection_manager import manager
from server.schemas import HealthResponse, AnalyzeResponse, ContextUpdateMessage

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("voicetrace")

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="VoiceTrace",
    description="Real-time voice cloning detection API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

risk_engine = RiskEngine()

# ── Shared processing helper ───────────────────────────────────────────────
async def _process_audio_chunk(audio_chunk, detector, call_id: str, context: CallContext):
    """Run inference and broadcast the event."""
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, detector.push, audio_chunk)
    if result:
        event = risk_engine.score(result, call_id, context)
        if LOG_SCORES:
            log.info(
                "process  call=%s  window=%d  risk=%d  band=%s  latency=%.1fms",
                call_id, event.window_index, event.risk_score,
                event.band, event.latency_ms,
            )
        await manager.broadcast(call_id, event.to_dict())

# ── GET /health ────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        active_calls=len(manager.detectors),
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
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not decode audio: {e}")

    call_id = f"analyze-{uuid.uuid4().hex[:8]}"
    
    # We borrow the connection manager to just create a detector but not connect a WS
    from detector.streaming import StreamingDetector
    detector = StreamingDetector()

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, detector.push_full, audio)

    if not results:
        raise HTTPException(
            status_code=422, detail="Audio too short — need at least 1 second"
        )

    events = [risk_engine.score(r, call_id).to_dict() for r in results]

    if LOG_SCORES:
        log.info(
            "analyze  call=%s  windows=%d  peak_risk=%d",
            call_id, len(events), max(e["risk_score"] for e in events),
        )

    return AnalyzeResponse(call_id=call_id, windows=events)

# ── WS /ws/call/{call_id} ─────────────────────────────────────────────────
@app.websocket("/ws/call/{call_id}")
async def ws_call(websocket: WebSocket, call_id: str):
    detector = await manager.connect_call(call_id, websocket)
    context = CallContext()
    log.info("ws_call  call=%s  connected", call_id)

    try:
        while True:
            message = await websocket.receive()
            if "text" in message and message["text"]:
                try:
                    ctrl = ContextUpdateMessage.model_validate_json(message["text"])
                    if ctrl.type == "context":
                        if ctrl.caller_familiarity is not None:
                            context.caller_familiarity = ctrl.caller_familiarity
                        if ctrl.transaction_risk is not None:
                            context.transaction_risk = ctrl.transaction_risk
                except ValidationError:
                    pass
                continue

            if "bytes" in message and message["bytes"]:
                raw = message["bytes"]
                try:
                    audio_chunk, _ = bytes_to_pcm(raw)
                except Exception as e:
                    log.debug("ws_call  call=%s  bad audio frame: %s", call_id, e)
                    continue

                await _process_audio_chunk(audio_chunk, detector, call_id, context)
    except WebSocketDisconnect:
        log.info("ws_call  call=%s  disconnected", call_id)
    finally:
        manager.disconnect_call(call_id, websocket)

# ── WS /ws/score ───────────────────────────────────────────────────────────
@app.websocket("/ws/score")
async def ws_score(websocket: WebSocket):
    await manager.connect_global(websocket)
    log.info("ws_score  dashboard connected")
    try:
        while True:
            try:
                await websocket.receive_text()
            except Exception:
                break # Malformed or closed
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_global(websocket)
        log.info("ws_score  dashboard disconnected")

# ── WS /ws/twilio ─────────────────────────────────────────────────────────
@app.websocket("/ws/twilio")
async def ws_twilio(websocket: WebSocket):
    await websocket.accept()
    call_id: str = f"twilio-{uuid.uuid4().hex[:8]}"
    from detector.streaming import StreamingDetector
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
                call_id = event.get("streamSid", call_id)
                log.info("ws_twilio  call=%s  stream started", call_id)
            elif event_type == "media":
                payload_b64 = event.get("media", {}).get("payload", "")
                if not payload_b64:
                    continue

                try:
                    loop = asyncio.get_running_loop()
                    audio_chunk = await loop.run_in_executor(None, decode_twilio_chunk, payload_b64)
                    await _process_audio_chunk(audio_chunk, detector, call_id, CallContext())
                except Exception as e:
                    log.warning("ws_twilio  call=%s  error: %s", call_id, e)
            elif event_type == "stop":
                break
    except WebSocketDisconnect:
        log.info("ws_twilio  call=%s  disconnected", call_id)
    finally:
        detector.reset()
