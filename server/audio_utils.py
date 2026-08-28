"""
VoiceTrace — server/audio_utils.py

Audio preprocessing helpers used by the server.

Responsibilities:
  - Resampling arbitrary-SR audio to 16 kHz (AASIST-L requirement)
  - Stereo → mono downmix
  - LUFS-based loudness normalisation (language/accent agnostic)
  - Twilio mu-law (8kHz, 8-bit) → float32 PCM decoder
  - Raw bytes → numpy float32 decoder for WebSocket binary frames
"""

from __future__ import annotations

import base64
import io
import struct
from typing import Tuple

import numpy as np
import soundfile as sf

from server.config import TARGET_SR

# ── Constants ──────────────────────────────────────────────────────────────

# ITU-R BS.1770 target integrated loudness for normalisation
_TARGET_LUFS = -23.0   # EBU R128 broadcast standard
_TWILIO_SR = 8000      # Twilio Media Streams default sample rate


# ── Internal helpers ───────────────────────────────────────────────────────

def _to_mono(audio: np.ndarray) -> np.ndarray:
    """Convert multi-channel audio to mono by averaging channels."""
    if audio.ndim > 1:
        return audio.mean(axis=1).astype(np.float32)
    return audio.astype(np.float32)


def _resample(audio: np.ndarray, from_sr: int, to_sr: int) -> np.ndarray:
    """Resample audio using scipy's polyphase filter (no librosa/numba needed)."""
    if from_sr == to_sr:
        return audio
    from scipy.signal import resample_poly
    from math import gcd
    g = gcd(to_sr, from_sr)
    up, down = to_sr // g, from_sr // g
    resampled = resample_poly(audio, up, down)
    return resampled.astype(np.float32)


def _lufs_normalize(audio: np.ndarray) -> np.ndarray:
    """
    Approximate LUFS normalisation.

    True ITU-R BS.1770 requires K-weighting filters; we use a simple
    RMS-based approximation that works well enough for detection purposes
    and is language/accent agnostic — it normalises energy, not timbre.
    """
    rms = np.sqrt(np.mean(audio ** 2))
    if rms < 1e-9:
        return audio   # silence — leave alone
    # Convert target LUFS to linear RMS (approximation: LUFS ≈ dBFS for speech)
    target_rms = 10 ** (_TARGET_LUFS / 20.0)
    gain = target_rms / rms
    # Clamp to avoid extreme gain on very quiet samples
    gain = float(np.clip(gain, 0.1, 10.0))
    return (audio * gain).astype(np.float32)


# ── Public API ─────────────────────────────────────────────────────────────

def bytes_to_pcm(data: bytes, sr: int = TARGET_SR) -> Tuple[np.ndarray, int]:
    """
    Decode raw bytes from a WebSocket binary frame into float32 PCM.

    Accepts:
      - soundfile-readable formats (WAV, FLAC, OGG embedded in bytes)
      - Raw float32 little-endian PCM (from browser AudioWorklet)

    Returns:
        (audio_float32_mono_16khz, sample_rate)
    """
    try:
        # Try soundfile first (handles WAV, FLAC, etc.)
        audio, file_sr = sf.read(io.BytesIO(data), dtype="float32")
        audio = _to_mono(audio)
        audio = _resample(audio, file_sr, TARGET_SR)
        audio = _lufs_normalize(audio)
        return audio, TARGET_SR
    except Exception:
        pass

    # Fallback: assume raw float32 little-endian at the given SR
    try:
        n_samples = len(data) // 4
        audio = np.frombuffer(data, dtype="<f4")[:n_samples]
        audio = _to_mono(audio.reshape(-1))
        audio = _resample(audio, sr, TARGET_SR)
        audio = _lufs_normalize(audio)
        return audio, TARGET_SR
    except Exception as e:
        raise ValueError(f"Could not decode audio bytes: {e}") from e


def file_bytes_to_pcm(data: bytes) -> np.ndarray:
    """
    Decode an uploaded audio file (WAV, MP3, FLAC, OGG, etc.) into
    float32 mono 16kHz PCM ready for inference.

    Returns:
        1-D float32 numpy array at 16 kHz.
    """
    audio, file_sr = sf.read(io.BytesIO(data), dtype="float32")
    audio = _to_mono(audio)
    audio = _resample(audio, file_sr, TARGET_SR)
    audio = _lufs_normalize(audio)
    return audio


def decode_twilio_chunk(payload_b64: str) -> np.ndarray:
    """
    Decode a Twilio Media Streams 'media' event payload.

    Twilio sends audio as base64-encoded 8kHz 8-bit mu-law (PCMU).
    We decode → linear int16 → float32 → resample to 16kHz.

    Args:
        payload_b64: base64-encoded mu-law payload from Twilio JSON event.
    Returns:
        float32 mono array at 16 kHz.
    """
    raw = base64.b64decode(payload_b64)
    # mu-law to linear 16-bit conversion (ITU-T G.711)
    pcm16 = np.array([_ulaw_to_linear(b) for b in raw], dtype=np.int16)
    audio = pcm16.astype(np.float32) / 32768.0
    audio = _resample(audio, _TWILIO_SR, TARGET_SR)
    audio = _lufs_normalize(audio)
    return audio


def _ulaw_to_linear(ulaw_byte: int) -> int:
    """ITU-T G.711 mu-law decompression for a single byte."""
    ulaw_byte = ~ulaw_byte & 0xFF
    sign = ulaw_byte & 0x80
    exponent = (ulaw_byte >> 4) & 0x07
    mantissa = ulaw_byte & 0x0F
    sample = ((mantissa << 1) + 33) << exponent
    sample -= 33
    return -sample if sign else sample
