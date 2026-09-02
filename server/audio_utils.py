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
import logging
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


def _ulaw_encode(sample: float) -> int:
    """
    ITU-T G.711 µ-law compressor (single sample, float [-1,1] → 8-bit int).
    Uses the exact logarithmic companding formula, NOT uniform quantization.
    """
    MU = 255.0
    sample = float(np.clip(sample, -1.0, 1.0))
    sign = 1 if sample >= 0 else -1
    magnitude = abs(sample)
    compressed = sign * (np.log1p(MU * magnitude) / np.log1p(MU))
    return int(np.round(compressed * 127)) & 0xFF


def _ulaw_decode(code: int) -> float:
    """
    ITU-T G.711 µ-law expander (8-bit int → float [-1,1]).
    """
    MU = 255.0
    code = float(code) / 127.0
    sign = 1.0 if code >= 0 else -1.0
    magnitude = abs(code)
    return sign * (np.expm1(magnitude * np.log1p(MU)) / MU)


def _simulate_telephony(audio: np.ndarray, orig_sr: int) -> np.ndarray:
    """
    In-memory simulation of a G.711 µ-law telephony bottleneck.

    Pipeline:
      1. Downsample to 8 kHz (telephone bandwidth limit)
      2. Apply real ITU-T G.711 µ-law companding (NOT uniform quantization)
      3. Upsample back to 16 kHz for AASIST-L

    This gives true domain parity with audio arriving from Twilio SIP trunks.
    """
    if orig_sr > 8000:
        audio_8k = _resample(audio, orig_sr, 8000)
    else:
        audio_8k = audio.copy()

    # Vectorized µ-law encode → decode (true companding round-trip)
    MU = 255.0
    sign = np.sign(audio_8k)
    magnitude = np.abs(audio_8k).clip(0.0, 1.0)
    # Encode: logarithmic compression
    encoded = sign * (np.log1p(MU * magnitude) / np.log1p(MU))
    # Quantize to 8-bit (256 levels)
    quantized = np.round(encoded * 127.0) / 127.0
    # Decode: logarithmic expansion
    magnitude_q = np.abs(quantized)
    degraded = np.sign(quantized) * (np.expm1(magnitude_q * np.log1p(MU)) / MU)
    degraded = degraded.astype(np.float32)

    return _resample(degraded, 8000, TARGET_SR)


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

def bytes_to_pcm(
    data: bytes,
    sr: int = TARGET_SR,
    apply_telephony: bool = False,
) -> Tuple[np.ndarray, int]:
    """
    Decode raw bytes from a WebSocket binary frame into float32 PCM.

    Accepts:
      - soundfile-readable formats (WAV, FLAC, OGG embedded in bytes)
      - Raw float32 little-endian PCM (from browser ScriptProcessor / AudioWorklet)

    Args:
        data:             Raw bytes from the WebSocket frame.
        sr:               Assumed sample rate for the raw-PCM fallback path.
        apply_telephony:  If True, run G.711 µ-law simulation before returning.
                          Set True ONLY for uploaded file analysis; keep False
                          for live WebRTC/mic audio (already clean float32).

    Returns:
        (audio_float32_mono_16khz, sample_rate)
    """
    try:
        # Try soundfile first (handles WAV, FLAC, etc.)
        audio, file_sr = sf.read(io.BytesIO(data), dtype="float32")
        audio = _to_mono(audio)
        if apply_telephony:
            audio = _simulate_telephony(audio, file_sr)
        audio = _lufs_normalize(audio)
        # Protection against NaN/Inf poisoning downstream (e.g. CUDA)
        np.nan_to_num(audio, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        return audio, TARGET_SR
    except Exception:
        pass

    # Fallback: assume raw float32 little-endian PCM at the given SR.
    # .copy() is REQUIRED: np.frombuffer returns a read-only view of `data`.
    # Subsequent nan_to_num(copy=False) would raise ValueError on a read-only
    # array. The copy also ensures the returned array outlives `data`.
    try:
        n_samples = len(data) // 4
        audio = np.frombuffer(data, dtype="<f4")[:n_samples].copy()
        audio = _to_mono(audio.reshape(-1))
        if apply_telephony:
            audio = _simulate_telephony(audio, sr)
        audio = _lufs_normalize(audio)
        np.nan_to_num(audio, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        return audio, TARGET_SR
    except Exception as e:
        raise ValueError(f"Could not decode audio bytes: {e}") from e


def file_bytes_to_pcm(data: bytes) -> np.ndarray:
    """
    Decode an uploaded audio file (WAV, MP3, FLAC, OGG, etc.) into
    float32 mono 16kHz PCM ready for inference.

    Telephony simulation IS applied here: uploaded files are typically
    clean studio/headset recordings. Simulating the G.711 PSTN bottleneck
    makes AASIST-L scores realistic for telephony deployment.

    Returns:
        1-D float32 numpy array at 16 kHz.
    """
    audio, file_sr = sf.read(io.BytesIO(data), dtype="float32")
    audio = _to_mono(audio)
    audio = _simulate_telephony(audio, file_sr)  # intentional — see docstring
    audio = _lufs_normalize(audio)
    np.nan_to_num(audio, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    return audio


def decode_twilio_chunk(payload_b64: str) -> np.ndarray:
    """
    Decode a Twilio Media Streams 'media' event payload.

    Twilio sends audio as base64-encoded 8kHz 8-bit mu-law (PCMU).
    We decode → linear int16 → float32 → resample to 16kHz.

    Uses a pre-built 256-entry numpy LUT (_ULAW_TABLE) for vectorized
    decoding instead of a Python for-loop — ~60× faster on 160-byte chunks.

    Args:
        payload_b64: base64-encoded mu-law payload from Twilio JSON event.
    Returns:
        float32 mono array at 16 kHz.
    """
    raw = base64.b64decode(payload_b64)
    # Vectorized µ-law decode via lookup table (replaces per-byte Python loop)
    pcm16 = _ULAW_TABLE[np.frombuffer(raw, dtype=np.uint8)]
    audio = pcm16.astype(np.float32) / 32768.0
    audio = _resample(audio, _TWILIO_SR, TARGET_SR)
    audio = _lufs_normalize(audio)
    np.nan_to_num(audio, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
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


def _build_ulaw_table() -> np.ndarray:
    """
    Build a 256-entry int16 lookup table for ITU-T G.711 µ-law decoding.

    Computed once at module import time. Vectorized decoding via
    `_ULAW_TABLE[np.frombuffer(raw, dtype=np.uint8)]` is ~60× faster
    than a Python for-loop over individual bytes.
    """
    table = np.zeros(256, dtype=np.int16)
    for i in range(256):
        table[i] = _ulaw_to_linear(i)
    return table


# Lookup table: computed once at import, reused for every Twilio media event.
_ULAW_TABLE: np.ndarray = _build_ulaw_table()
