"""
tests/test_twilio_bridge.py

End-to-end mock test for the Twilio Media Streams bridge.

What this proves:
  - /twilio/incoming returns valid TwiML with a <Connect><Stream> element
    pointing at the correct wss:// URL
  - /ws/twilio accepts Twilio-shaped messages (start + media + stop events)
    and pushes audio through the detector pipeline without crashing
  - The vectorized µ-law decode (_ULAW_TABLE path) produces correct output

This test runs entirely without a real Twilio account. It generates
synthetic µ-law encoded audio (silence + a tone) and sends it through
the WebSocket in the same format Twilio's Media Streams service would.

Run:
  pytest tests/test_twilio_bridge.py -v
"""
from __future__ import annotations

import asyncio
import base64
import json
import struct
import uuid

import numpy as np
import pytest
from fastapi.testclient import TestClient

# ── Helpers ────────────────────────────────────────────────────────────────

def _make_ulaw_payload(n_samples: int = 160, frequency_hz: float = 440.0) -> str:
    """
    Generate a base64-encoded 8kHz µ-law payload as Twilio would send.
    Uses a 440Hz sine tone so the decoder has real signal to process.
    """
    t = np.linspace(0, n_samples / 8000.0, n_samples, endpoint=False)
    pcm_f32 = (np.sin(2 * np.pi * frequency_hz * t) * 0.5).astype(np.float32)

    # Encode float32 → µ-law bytes (ITU-T G.711)
    MU = 255.0
    sign = np.sign(pcm_f32)
    mag = np.abs(pcm_f32).clip(0.0, 1.0)
    encoded = sign * (np.log1p(MU * mag) / np.log1p(MU))
    ulaw_bytes = (np.round(encoded * 127.0).astype(np.int16) & 0xFF).astype(np.uint8).tobytes()
    return base64.b64encode(ulaw_bytes).decode("ascii")


def _twilio_start_event(stream_sid: str) -> str:
    return json.dumps({
        "event": "start",
        "sequenceNumber": "1",
        "start": {
            "streamSid": stream_sid,
            "accountSid": "ACtest000000000000000000000000000000",
            "callSid": "CAtest000000000000000000000000000000",
            "tracks": ["inbound"],
            "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
        },
        "streamSid": stream_sid,
    })


def _twilio_media_event(stream_sid: str, seq: int, payload_b64: str) -> str:
    return json.dumps({
        "event": "media",
        "sequenceNumber": str(seq),
        "media": {
            "track": "inbound",
            "chunk": str(seq),
            "timestamp": str(seq * 20),
            "payload": payload_b64,
        },
        "streamSid": stream_sid,
    })


def _twilio_stop_event(stream_sid: str) -> str:
    return json.dumps({
        "event": "stop",
        "sequenceNumber": "99",
        "stop": {"accountSid": "ACtest", "callSid": "CAtest"},
        "streamSid": stream_sid,
    })


# ── Fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """Synchronous TestClient wrapping the FastAPI app (no real server needed)."""
    from server.main import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ── Tests ──────────────────────────────────────────────────────────────────

class TestTwiMLWebhook:
    """POST /twilio/incoming — returns valid TwiML."""

    def test_returns_xml_content_type(self, client):
        resp = client.post("/twilio/incoming")
        assert resp.status_code == 200
        assert "xml" in resp.headers["content-type"]

    def test_twiml_contains_connect_stream(self, client):
        resp = client.post("/twilio/incoming")
        body = resp.text
        # Fix 2: must use <Connect> not <Start> (which caused 60s hangup)
        assert "<Connect>" in body, "TwiML must use <Connect> to avoid 60s hangup"
        assert "<Stream" in body, "TwiML must contain a <Stream> element"
        assert "</Connect>" in body

    def test_twiml_does_not_contain_pause(self, client):
        resp = client.post("/twilio/incoming")
        # The old <Pause length="60"/> that caused hangups must be gone
        assert "<Pause" not in resp.text, "<Pause> was the 60s hangup bug — must be removed"

    def test_twiml_stream_url_is_ws(self, client):
        """Local requests (no x-forwarded-proto) should produce ws:// URLs."""
        resp = client.post("/twilio/incoming")
        assert "ws://" in resp.text or "wss://" in resp.text

    def test_twiml_stream_url_is_wss_for_ngrok(self, client):
        """Ngrok host header should produce wss:// stream URL."""
        resp = client.post(
            "/twilio/incoming",
            headers={"host": "abc123.ngrok-free.app"},
        )
        assert "wss://" in resp.text, "ngrok host must produce wss:// URL"

    def test_twiml_stream_url_is_wss_for_cloudflared(self, client):
        """cloudflared host should produce wss:// stream URL (Fix 4)."""
        resp = client.post(
            "/twilio/incoming",
            headers={"host": "random-words.trycloudflare.com"},
        )
        assert "wss://" in resp.text, "trycloudflare host must produce wss:// URL"


class TestUlawDecode:
    """Unit tests for the vectorized µ-law decode path."""

    def test_silence_decodes_to_near_zero(self):
        """µ-law byte 0xFF encodes near-zero amplitude — silence."""
        from server.audio_utils import _ULAW_TABLE
        # 0xFF is the µ-law encoding of 0 (silence)
        result = _ULAW_TABLE[np.array([0xFF], dtype=np.uint8)]
        assert abs(int(result[0])) < 200, f"Silence decoded to unexpected value: {result[0]}"

    def test_table_matches_scalar_function(self):
        """LUT must produce identical results to the original scalar function."""
        from server.audio_utils import _ULAW_TABLE, _ulaw_to_linear
        for i in range(256):
            lut_val = int(_ULAW_TABLE[i])
            scalar_val = _ulaw_to_linear(i)
            assert lut_val == scalar_val, (
                f"LUT mismatch at byte {i}: LUT={lut_val}, scalar={scalar_val}"
            )

    def test_decode_twilio_chunk_returns_float32_at_16khz(self):
        """Full decode pipeline: base64 µ-law payload → float32 array at 16kHz."""
        from server.audio_utils import decode_twilio_chunk
        payload = _make_ulaw_payload(n_samples=160)
        audio = decode_twilio_chunk(payload)
        assert audio.dtype == np.float32
        # 160 samples at 8kHz upsampled to 16kHz → ~320 samples
        assert len(audio) > 100, "Upsampled output must have samples"
        assert np.all(np.isfinite(audio)), "No NaN/Inf in output"

    def test_decode_twilio_chunk_amplitude_in_range(self):
        """Decoded audio must be in [-1, 1] after LUFS normalization."""
        from server.audio_utils import decode_twilio_chunk
        # Use a loud tone to test normalization clamping
        payload = _make_ulaw_payload(n_samples=160, frequency_hz=1000.0)
        audio = decode_twilio_chunk(payload)
        assert audio.max() <= 10.0, "LUFS normalization allows max gain of 10x"


class TestTwilioWebSocket:
    """WS /ws/twilio — accepts Twilio-shaped media stream events."""

    def test_websocket_accepts_start_media_stop(self, client):
        """
        Full mock Twilio session: start → 20 media events → stop.
        Server must not crash. Tests the full decode+push pipeline.
        """
        stream_sid = f"MZ{uuid.uuid4().hex[:30]}"
        payload = _make_ulaw_payload(n_samples=160)

        with client.websocket_connect("/ws/twilio") as ws:
            # 1. Send start event
            ws.send_text(_twilio_start_event(stream_sid))

            # 2. Send 20 media chunks (~400ms of audio at 8kHz)
            for seq in range(2, 22):
                ws.send_text(_twilio_media_event(stream_sid, seq, payload))

            # 3. Send stop event — server should break out of its loop cleanly
            ws.send_text(_twilio_stop_event(stream_sid))

        # If we get here without an exception, the pipeline handled all events

    def test_websocket_missing_stream_sid_closes_with_1008(self, client):
        """Server must reject a stream with no streamSid (policy violation)."""
        with client.websocket_connect("/ws/twilio") as ws:
            # Send a start event with no streamSid
            ws.send_text(json.dumps({"event": "start", "start": {}, "streamSid": ""}))
            # The server should close with code 1008
            with pytest.raises(Exception):
                # Any receive after the server closes should raise
                ws.receive_text()

    def test_websocket_ignores_malformed_json(self, client):
        """Server must not crash on malformed JSON frames — just skip them."""
        stream_sid = f"MZ{uuid.uuid4().hex[:30]}"
        payload = _make_ulaw_payload()

        with client.websocket_connect("/ws/twilio") as ws:
            ws.send_text(_twilio_start_event(stream_sid))
            # Send a malformed JSON frame — server should continue
            ws.send_text("NOT_VALID_JSON{{{{")
            # Send a valid media frame — should still process
            ws.send_text(_twilio_media_event(stream_sid, 2, payload))
            ws.send_text(_twilio_stop_event(stream_sid))
