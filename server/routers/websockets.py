import asyncio
import json
import logging
import uuid
import numpy as np

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from server.audio_utils import bytes_to_pcm, decode_twilio_chunk
from server.connection_manager import manager
from server.call_manager import call_manager
from server.schemas import ContextUpdateMessage, ChallengeAudioMessage
from server.challenge import ChallengeManager
from server.signaling import signaling_manager
from server.routers.auth import _verify_ws_key_payload
from server.config import MAX_CHALLENGE_BUFFER_SIZE, WS_IDLE_TIMEOUT

router = APIRouter()
log = logging.getLogger("voicetrace")
challenge_mgr = ChallengeManager()

@router.websocket("/ws/call/{call_id}")
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
            message = await asyncio.wait_for(websocket.receive(), timeout=WS_IDLE_TIMEOUT)

            if message.get("text"):
                try:
                    ctrl = ContextUpdateMessage.model_validate_json(message["text"])
                except ValidationError as e:
                    await websocket.send_json({"error": "Invalid message format", "details": e.errors()})
                    continue
                
                if ctrl.type == "ping":
                    await websocket.send_json({"type": "pong"})
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


@router.websocket("/ws/score")
async def ws_score(websocket: WebSocket):
    await websocket.accept()
    if not await _verify_ws_key_payload(websocket):
        return

    await manager.connect_global(websocket)
    log.info("ws_score  dashboard connected")
    try:
        while True:
            # 60s idle timeout (Dashboard should send pings if needed)
            await asyncio.wait_for(websocket.receive_text(), timeout=WS_IDLE_TIMEOUT)
    except asyncio.TimeoutError:
        log.warning("ws_score  timed out")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error(f"ws_score  error: {e}")
    finally:
        manager.disconnect_global(websocket)
        log.info("ws_score  dashboard disconnected")


@router.get("/rooms/{room_id}/exists")
async def room_exists(room_id: str):
    """
    REST check: does this signaling room exist and have space?
    Used by the Call page to decide whether to show "Join" vs "Room full".
    """
    exists = signaling_manager.room_exists(room_id)
    peers = signaling_manager.peer_count(room_id)
    return {"exists": exists, "peer_count": peers, "full": peers >= 2}


@router.websocket("/ws/signal/{room_id}")
async def ws_signal(websocket: WebSocket, room_id: str):
    """
    WebRTC signaling relay for 1:1 in-app calls.
    """
    await websocket.accept()
    if not await _verify_ws_key_payload(websocket):
        return

    joined = await signaling_manager.join(room_id, websocket)
    if not joined:
        await websocket.close(code=1008, reason="Room full (max 2 peers)")
        return

    log.info("ws_signal  room=%s  peer joined", room_id)

    try:
        while True:
            # 30s idle timeout — WebRTC handshake should complete in <5s
            message = await asyncio.wait_for(websocket.receive_text(), timeout=300.0)
            try:
                msg_data = json.loads(message)
                if isinstance(msg_data, dict) and msg_data.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue
            except Exception:
                pass
            await signaling_manager.relay(room_id, websocket, message)

    except asyncio.TimeoutError:
        log.warning("ws_signal  room=%s  timed out (5min idle)", room_id)
    except WebSocketDisconnect:
        log.info("ws_signal  room=%s  peer disconnected", room_id)
    except Exception as exc:
        log.error("ws_signal  room=%s  error: %s", room_id, exc)
    finally:
        await signaling_manager.leave(room_id, websocket)


@router.websocket("/ws/twilio")
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
