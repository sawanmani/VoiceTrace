"""
VoiceTrace — server/challenge.py  (FIX 1: No more pyttsx3)

Challenge generation using pre-rendered WAV files to avoid pyttsx3 COM deadlocks.
On first startup, generates a pool of N random digit-sequence challenges using
a subprocess-isolated TTS call so the event loop is never blocked.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import random
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf

log = logging.getLogger("voicetrace.challenge")

# ── Config ──────────────────────────────────────────────────────────────────
_CHALLENGE_POOL_DIR = Path("models") / "challenge_pool"
_POOL_SIZE = 100          # pre-render this many files on startup
_RESPONSE_SEC = 4         # seconds to collect caller response audio


# ── Pool Generator (run once at startup, subprocess-isolated) ───────────────

def _render_one(text: str, out_path: Path) -> bool:
    """
    Generate TTS for *text* and write 16kHz mono WAV to *out_path*.
    Runs inside a subprocess so any COM/SAPI5 blocking is fully isolated.
    """
    script = (
        "import sys, pyttsx3, soundfile as sf, numpy as np\n"
        "engine = pyttsx3.init()\n"
        "engine.setProperty('rate', 140)\n"
        f"engine.save_to_file({text!r}, {str(out_path)!r})\n"
        "engine.runAndWait()\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        timeout=20,
        capture_output=True,
    )
    return result.returncode == 0 and out_path.exists()


def build_challenge_pool() -> int:
    """
    Pre-generate _POOL_SIZE challenge WAV files into _CHALLENGE_POOL_DIR.
    Returns number of files successfully generated.
    """
    _CHALLENGE_POOL_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    for i in range(_POOL_SIZE):
        digits = [str(random.randint(0, 9)) for _ in range(4)]
        code = "".join(digits)
        spoken = " ".join(digits)
        prompt = f"Please repeat: {spoken}"
        out_path = _CHALLENGE_POOL_DIR / f"{code}.wav"

        if out_path.exists():
            generated += 1
            continue

        try:
            ok = _render_one(prompt, out_path)
            if ok:
                generated += 1
                log.debug("Rendered challenge %s → %s", code, out_path)
            else:
                log.warning("TTS render failed for code %s", code)
        except subprocess.TimeoutExpired:
            log.error("TTS subprocess timed out for code %s", code)

    log.info("Challenge pool: %d/%d files ready in %s", generated, _POOL_SIZE, _CHALLENGE_POOL_DIR)
    return generated


# ── Runtime ChallengeManager (hot path — reads from pool only) ─────────────

class ChallengeManager:
    """Thread-safe, event-loop-friendly challenge manager.

    Picks a random pre-rendered WAV from the pool → returns it as raw
    float32 PCM bytes.  No pyttsx3 on the hot path.
    """

    def pick_challenge(self) -> Optional[dict]:
        """
        Pick a random pre-rendered challenge from the pool.
        Returns dict with 'expected_text', 'audio_pcm' (np.ndarray at 16kHz), 'prompt'.
        Returns None if the pool is empty (fall back gracefully).
        """
        wav_files = list(_CHALLENGE_POOL_DIR.glob("*.wav"))
        if not wav_files:
            log.error("Challenge pool is empty — cannot trigger challenge. Run build_challenge_pool() first.")
            return None

        chosen = random.choice(wav_files)
        code = chosen.stem      # filename is the 4-digit code
        digits = list(code)
        prompt = f"Please repeat: {' '.join(digits)}"

        try:
            audio, sr = sf.read(chosen, dtype="float32")
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            if sr != 16000:
                from server.audio_utils import _resample
                audio = _resample(audio, sr, 16000)
        except Exception as e:
            log.error("Failed to read challenge WAV %s: %s", chosen, e)
            return None

        return {
            "expected_text": code,
            "audio_pcm": audio,
            "prompt": prompt,
        }

    def encode_challenge_b64(self, chal: dict) -> str:
        """Pack float32 PCM into base64 for WebSocket transport."""
        pcm: np.ndarray = chal["audio_pcm"]
        # Use tobytes() — much faster than struct.pack(*iterable) for large arrays
        raw_bytes = pcm.astype("<f4").tobytes()
        return base64.b64encode(raw_bytes).decode("ascii")

    def verify_response(self, expected_code: str, audio: np.ndarray) -> bool:
        """
        Verify caller response using SpeechBrain ASR.
        Falls open (True) if ASR is unavailable so the demo stays unblocked.
        """
        try:
            import torch
            from speechbrain.inference.ASR import EncoderDecoderASR

            # Use the cached global model (warmed up at startup)
            from server._model_cache import get_asr_model  # noqa: PLC0415
            asr = get_asr_model()
            if asr is None:
                return False

            batch = torch.FloatTensor(audio).unsqueeze(0)
            lengths = torch.tensor([1.0])
            # Move to same device as model to prevent CUDA device mismatch
            device = next(asr.mods.parameters()).device
            batch = batch.to(device)
            lengths = lengths.to(device)
            transcription = asr.transcribe_batch(batch, lengths)[0][0]

            log.info("Challenge ASR: '%s', expected: '%s'", transcription, expected_code)

            # Strip punctuation before digit lookup
            cleaned = re.sub(r"[^A-Z0-9 ]", "", transcription.upper())
            word_to_digit = {
                "ZERO": "0", "ONE": "1", "TWO": "2", "THREE": "3", "FOUR": "4",
                "FIVE": "5", "SIX": "6", "SEVEN": "7", "EIGHT": "8", "NINE": "9",
            }
            spoken_digits = "".join(
                word_to_digit.get(w, w) for w in cleaned.split()
                if w in word_to_digit or w.isdigit()
            )
            return expected_code in spoken_digits

        except Exception as e:
            log.error("ASR verification error: %s", e)
            return False   # fail closed
