"""
VoiceTrace — server/audiosocket_server.py

Asyncio TCP server implementing the Asterisk AudioSocket protocol.
Receives raw 8kHz PCM audio from Asterisk, decodes it, and feeds it into
the existing StreamingDetector → BatchWorker → RiskEngine pipeline.

Design decisions:
- Uses call_manager directly (NOT connection_manager) because AudioSocket
  is TCP, not WebSocket. The BatchWorker polls call_manager.get_all_calls()
  which is transport-agnostic.
- Uses asyncio.StreamReader.readexactly() for safe TCP reads.
- 60-second idle timeout to prevent memory leaks from half-open connections.
"""

import asyncio
import logging
import struct
import uuid

import numpy as np

from server.audio_utils_asterisk import decode_asterisk_chunk
from server.call_manager import call_manager
from server.pubsub import broker

log = logging.getLogger("voicetrace.audiosocket")

# AudioSocket message types (from Asterisk source: res/res_audiosocket.c)
MSG_HANGUP  = 0x00
MSG_UUID    = 0x01
MSG_SILENCE = 0x02
MSG_DTMF    = 0x03
MSG_AUDIO   = 0x10

# Header format: 1 byte type + 2 bytes length (big-endian)
HEADER_FORMAT = ">BH"
HEADER_SIZE = 3

# Connection idle timeout (seconds)
IDLE_TIMEOUT = 60.0


async def _handle_connection(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    """Handle a single AudioSocket TCP connection from Asterisk."""
    peer = writer.get_extra_info("peername")
    call_id = None
    state = None

    log.info("audiosocket  new TCP connection from %s", peer)

    try:
        while True:
            # Read 3-byte header with timeout
            try:
                header_bytes = await asyncio.wait_for(
                    reader.readexactly(HEADER_SIZE),
                    timeout=IDLE_TIMEOUT
                )
            except asyncio.TimeoutError:
                log.warning("audiosocket  call=%s  timed out (no data for %ds)",
                           call_id, int(IDLE_TIMEOUT))
                break
            except asyncio.IncompleteReadError:
                log.info("audiosocket  call=%s  connection closed by Asterisk", call_id)
                break

            msg_type, payload_len = struct.unpack(HEADER_FORMAT, header_bytes)

            # Read payload (if any)
            payload = b""
            if payload_len > 0:
                try:
                    payload = await asyncio.wait_for(
                        reader.readexactly(payload_len),
                        timeout=IDLE_TIMEOUT
                    )
                except (asyncio.TimeoutError, asyncio.IncompleteReadError):
                    log.warning("audiosocket  call=%s  incomplete payload", call_id)
                    break

            # ── Handle message by type ──

            if msg_type == MSG_HANGUP:
                log.info("audiosocket  call=%s  hangup received", call_id)
                break

            elif msg_type == MSG_UUID:
                # First message: 16-byte raw UUID identifying this channel
                if len(payload) >= 16:
                    channel_uuid = str(uuid.UUID(bytes=payload[:16]))
                    call_id = f"asterisk-{channel_uuid[:8]}"
                    state = call_manager.add_call(call_id)
                    await broker.increment_active_calls()
                    log.info("audiosocket  call=%s  connected  uuid=%s",
                            call_id, channel_uuid[:8])
                else:
                    log.warning("audiosocket  UUID payload too short: %d bytes",
                               len(payload))

            elif msg_type == MSG_AUDIO:
                if state is None:
                    # Audio arrived before UUID — skip
                    continue

                try:
                    # Decode 8kHz signed-16-bit-LE PCM → 16kHz float32
                    audio_chunk = decode_asterisk_chunk(payload)
                    # Push into StreamingDetector buffer — BatchWorker picks it up
                    state.detector.push(audio_chunk)
                except Exception as exc:
                    log.warning("audiosocket  call=%s  decode error: %s",
                               call_id, exc)

            elif msg_type == MSG_SILENCE:
                # Asterisk sends silence frames during pauses — safe to ignore
                pass

            elif msg_type == MSG_DTMF:
                if payload:
                    digit = chr(payload[0]) if payload[0] < 128 else "?"
                    log.info("audiosocket  call=%s  DTMF digit: %s", call_id, digit)

            else:
                log.debug("audiosocket  call=%s  unknown msg type: 0x%02x",
                         call_id, msg_type)

    except ConnectionResetError:
        log.info("audiosocket  call=%s  connection reset", call_id)
    except Exception as exc:
        log.error("audiosocket  call=%s  unexpected error: %s",
                 call_id, exc, exc_info=True)
    finally:
        # ── Cleanup ──
        if call_id and state:
            import time
            from datetime import datetime
            from server.risk_engine import band_from_score
            from server.history_db import save_call

            duration_sec = int(time.time() - state.start_time)
            peak = state.peak_risk
            band = band_from_score(int(peak))

            call_data = {
                "call_id": call_id,
                "time": datetime.now().strftime("%H:%M:%S"),
                "peak_risk": peak,
                "band": band,
                "windows": state.windows_processed,
                "duration_sec": duration_sec,
                "completed": True,
            }
            asyncio.create_task(save_call(call_data))

            call_manager.remove_call(call_id)
            await broker.decrement_active_calls()
            log.info(
                "audiosocket  call=%s  disconnected  duration=%ds  peak_risk=%.0f  band=%s",
                call_id, duration_sec, peak, band,
            )

        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def start_audiosocket_server():
    """
    Start the AudioSocket TCP server.

    Called from server/main.py lifespan() as a background task.
    Listens for incoming TCP connections from Asterisk's AudioSocket() dialplan app.
    """
    from server.config import AUDIOSOCKET_HOST, AUDIOSOCKET_PORT

    server = await asyncio.start_server(
        _handle_connection, AUDIOSOCKET_HOST, AUDIOSOCKET_PORT
    )

    addrs = ", ".join(str(sock.getsockname()) for sock in server.sockets)
    log.info("AudioSocket TCP server listening on %s", addrs)

    async with server:
        await server.serve_forever()
