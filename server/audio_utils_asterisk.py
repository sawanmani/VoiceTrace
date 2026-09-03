"""
VoiceTrace — server/audio_utils_asterisk.py

AudioSocket-specific audio decoder. Separated from audio_utils.py to keep
the Twilio decoder untouched and avoid merge conflicts.

AudioSocket sends signed 16-bit little-endian PCM at 8kHz mono.
This is SIMPLER than Twilio (no µ-law decode needed — just int16 → float32).
"""

from __future__ import annotations

import numpy as np

from server.audio_utils import _resample, _lufs_normalize
from server.config import TARGET_SR

# Asterisk AudioSocket sample rate (G.711 telephony standard)
_ASTERISK_SR = 8000


def decode_asterisk_chunk(raw_bytes: bytes) -> np.ndarray:
    """
    Decode an AudioSocket audio payload into float32 PCM at 16kHz.

    AudioSocket sends signed 16-bit little-endian PCM at 8kHz mono.
    This is simpler than Twilio's µ-law — no companding decode needed.

    Pipeline:
      1. np.frombuffer → int16 array (MUST .copy() — frombuffer is read-only)
      2. int16 → float32: divide by 32768.0
      3. Resample 8kHz → 16kHz via polyphase filter (same as Twilio path)
      4. LUFS normalize (same as Twilio path)
      5. NaN guard (same as Twilio path)

    Args:
        raw_bytes: Raw bytes from AudioSocket audio message payload.
                   Typically 320 bytes = 160 samples × 2 bytes = 20ms at 8kHz.
    Returns:
        float32 mono array at 16kHz, ready for StreamingDetector.push()
    """
    # Step 1: Parse bytes → int16 array
    # CRITICAL: .copy() is REQUIRED. np.frombuffer returns a read-only view.
    # Without copy, LivenessChecker's `signs[signs == 0] = 1` will raise
    # ValueError: assignment destination is read-only
    pcm16 = np.frombuffer(raw_bytes, dtype=np.int16).copy()

    if len(pcm16) == 0:
        return np.array([], dtype=np.float32)

    # Step 2: Normalize to float32 [-1.0, 1.0]
    audio = pcm16.astype(np.float32) / 32768.0

    # Step 3: Resample 8kHz → 16kHz (AASIST-L requires 16kHz)
    audio = _resample(audio, _ASTERISK_SR, TARGET_SR)

    # Step 4: LUFS normalization (energy normalization, language-agnostic)
    audio = _lufs_normalize(audio)

    # Step 5: NaN/Inf guard — prevents CUDA crashes downstream
    # Same guard used in decode_twilio_chunk() at audio_utils.py:224
    np.nan_to_num(audio, copy=False, nan=0.0, posinf=0.0, neginf=0.0)

    return audio
