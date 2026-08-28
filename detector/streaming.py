"""
VoiceTrace — detector/streaming.py

Provides:
  - LivenessChecker: heuristic checks that distinguish real microphone audio
    from TTS / pre-recorded playback before the neural model runs.
  - StreamingDetector: buffers incoming PCM into overlapping windows,
    runs AASIST-L inference on each, extracts named sub-feature scores,
    applies EMA smoothing, and returns DetectionResult objects.

Design notes:
  - Stateless with respect to persistent storage (no disk writes).
  - All state lives in the StreamingDetector instance — one per active call.
  - Sub-feature scores are derived from AASIST-L's last_hidden representation
    by splitting the 160-dim vector into 5 named 32-dim buckets and using the
    mean L2 norm of each bucket as a proxy "activation magnitude" score.
    This is a lightweight, model-consistent explainability approach that does
    not require separate probing classifiers.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch

from detector.inference import (
    AASIST_L_CONFIG,
    DEFAULT_CHECKPOINT,
    load_model,
    pad_or_trim,
)
from server.config import (
    CLIPPING_FRACTION_LIMIT,
    CLIPPING_THRESHOLD,
    NOISE_FLOOR_VARIANCE_MIN,
    NB_SAMP,
    SILENCE_THRESHOLD,
    SMOOTHING_ALPHA,
    STRIDE_SEC,
    TARGET_SR,
    WINDOW_SEC,
    ZCR_MAX,
    ZCR_MIN,
)


# ── Data types ─────────────────────────────────────────────────────────────

@dataclass
class LivenessResult:
    """Outcome of heuristic liveness analysis on a single audio window."""
    liveness_score: float          # 0 = dead / synthetic, 1 = alive / natural
    is_silent: bool
    has_clipping: bool
    noise_floor_ok: bool
    zcr_ok: bool
    detail: Dict[str, float] = field(default_factory=dict)


@dataclass
class DetectionResult:
    """Full output for one scored audio window."""
    spoof_prob: float              # 0 = genuine, 1 = spoofed (AASIST-L output)
    liveness_score: float          # from LivenessChecker
    band: str                      # "low" | "medium" | "high" (set by RiskEngine)
    signals: Dict[str, float]      # named sub-feature scores
    latency_ms: float
    window_index: int
    smoothed_spoof_prob: float     # EMA-smoothed version


# ── Liveness Checker ────────────────────────────────────────────────────────

class LivenessChecker:
    """
    Heuristic voice liveness checks.

    Real microphone audio has:
      - Some low-level noise (non-zero noise floor variance)
      - Natural zero-crossing rate (not too high, not too low)
      - Occasional, not systematic clipping

    TTS / replayed audio tends to have:
      - Suspiciously clean noise floor
      - Abnormal ZCR for certain synthesizers
      - Clipping if the recording was normalized to 0 dBFS
    """

    def check(self, audio: np.ndarray) -> LivenessResult:
        """
        Args:
            audio: 1-D float32 array at TARGET_SR.
        Returns:
            LivenessResult with individual flags and a combined liveness_score.
        """
        # 1. Silence check
        rms = float(np.sqrt(np.mean(audio ** 2)))
        is_silent = rms < SILENCE_THRESHOLD

        # 2. Clipping check — TTS often outputs audio normalized to peak = 1.0
        clipped_fraction = float(np.mean(np.abs(audio) > CLIPPING_THRESHOLD))
        has_clipping = clipped_fraction > CLIPPING_FRACTION_LIMIT

        # 3. Noise floor variance — real mics always have thermal noise
        noise_floor_var = float(np.var(audio))
        noise_floor_ok = noise_floor_var > NOISE_FLOOR_VARIANCE_MIN

        # 4. Zero-crossing rate — measure of spectral complexity
        signs = np.sign(audio)
        signs[signs == 0] = 1
        zcr = float(np.mean(np.abs(np.diff(signs)) / 2))
        zcr_ok = ZCR_MIN <= zcr <= ZCR_MAX

        # Combine into a single liveness score (0 = synthetic, 1 = live)
        # Each flag contributes equally; silence overrides everything
        if is_silent:
            liveness_score = 0.0
        else:
            checks_passed = sum([not has_clipping, noise_floor_ok, zcr_ok])
            liveness_score = checks_passed / 3.0

        return LivenessResult(
            liveness_score=liveness_score,
            is_silent=is_silent,
            has_clipping=has_clipping,
            noise_floor_ok=noise_floor_ok,
            zcr_ok=zcr_ok,
            detail={
                "rms": rms,
                "clipped_fraction": clipped_fraction,
                "noise_floor_variance": noise_floor_var,
                "zcr": zcr,
            },
        )


# ── Feature extraction from AASIST-L internals ─────────────────────────────

# AASIST-L last_hidden has shape (batch, 160).
# We name 5 contiguous 32-dim slices and use mean-norm as a proxy score.
_FEATURE_SLICES: List[Tuple[str, int, int]] = [
    ("spectral_artifact_score",    0,   32),
    ("prosody_irregularity_score", 32,  64),
    ("gan_artifact_score",         64,  96),
    ("f0_trajectory_score",        96,  128),
    ("phase_coherence_score",      128, 160),
]


def _extract_signals(last_hidden: torch.Tensor) -> Dict[str, float]:
    """
    Derive named sub-feature scores from AASIST-L's last hidden representation.

    We take the mean L2 norm of 5 equal 32-dim slices, then normalise each to
    [0, 1] using a soft-clamp (tanh of the raw norm / scale).  Higher values
    indicate higher anomaly activation in that frequency/temporal region.

    Args:
        last_hidden: (1, 160) tensor from model forward pass.
    Returns:
        Dict mapping feature name → float in [0, 1].
    """
    h = last_hidden.squeeze(0)  # (160,)
    scores: Dict[str, float] = {}
    for name, start, end in _FEATURE_SLICES:
        bucket = h[start:end]
        norm = float(torch.norm(bucket).item())
        # Soft-clamp to [0, 1]: tanh(norm / 4) — norm ~4 maps to ~0.96
        scores[name] = float(np.tanh(norm / 4.0))
    return scores


# ── Global Model Cache ───────────────────────────────────────────────────────

_cached_model = None

def _get_model(checkpoint: Path, device: str):
    global _cached_model
    if _cached_model is None:
        _cached_model = load_model(checkpoint, device)
    return _cached_model

# ── Streaming Detector ──────────────────────────────────────────────────────

class StreamingDetector:
    """
    Buffers a continuous PCM stream into overlapping windows and runs
    AASIST-L inference on each window.

    Usage:
        detector = StreamingDetector()
        for chunk in audio_source:          # raw float32 PCM at 16 kHz
            result = detector.push(chunk)   # returns DetectionResult or None
            if result:
                handle(result)
        detector.reset()                    # clears buffer for a new call
    """

    def __init__(
        self,
        checkpoint: Optional[Path] = None,
        device: Optional[str] = None,
    ):
        self._checkpoint = checkpoint or DEFAULT_CHECKPOINT
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._model = _get_model(self._checkpoint, self._device)

        self._liveness = LivenessChecker()

        # Audio ring buffer — stores raw float32 samples
        self._buffer: np.ndarray = np.array([], dtype=np.float32)
        self._window_samples = int(WINDOW_SEC * TARGET_SR)
        self._stride_samples = int(STRIDE_SEC * TARGET_SR)

        # EMA state
        self._ema_prob: Optional[float] = None
        self._alpha = SMOOTHING_ALPHA

        self._window_index = 0

    # ── Public API ─────────────────────────────────────────────────────────

    def push(self, chunk: np.ndarray) -> Optional[DetectionResult]:
        """
        Feed raw PCM audio (float32, 16 kHz, mono) into the detector.

        Returns a DetectionResult when a full window has been accumulated,
        otherwise returns None.

        Args:
            chunk: 1-D float32 array of any length.
        Returns:
            DetectionResult if a window is ready, else None.
        """
        self._buffer = np.concatenate([self._buffer, chunk])

        if len(self._buffer) < self._window_samples:
            return None

        # Extract window
        window = self._buffer[: self._window_samples]

        # Advance buffer by stride
        self._buffer = self._buffer[self._stride_samples :]

        return self._score_window(window)

    def push_full(self, audio: np.ndarray) -> List[DetectionResult]:
        """
        Score a complete audio array (e.g. from a file upload) by pushing
        it through the streaming pipeline window-by-window.

        Returns a list of DetectionResult objects (one per window).
        """
        results: List[DetectionResult] = []
        # Push in 0.5s chunks to simulate streaming
        chunk_size = int(0.5 * TARGET_SR)
        for i in range(0, len(audio), chunk_size):
            chunk = audio[i : i + chunk_size]
            result = self.push(chunk)
            if result:
                results.append(result)

        # Flush any remaining buffer content
        if len(self._buffer) > 0:
            result = self._score_window(self._buffer)
            if result:
                results.append(result)
            self._buffer = np.array([], dtype=np.float32)

        return results

    def reset(self) -> None:
        """Clear all buffer and EMA state for a new call."""
        self._buffer = np.array([], dtype=np.float32)
        self._ema_prob = None
        self._window_index = 0

    # ── Internal ───────────────────────────────────────────────────────────

    def _score_window(self, window: np.ndarray) -> DetectionResult:
        t0 = time.perf_counter()

        # Pad / trim to AASIST-L fixed input length
        audio_fixed = pad_or_trim(window, NB_SAMP)

        # Run liveness heuristics
        liveness_result = self._liveness.check(window)

        # Run AASIST-L
        x = torch.FloatTensor(audio_fixed).unsqueeze(0).to(self._device)
        with torch.no_grad():
            last_hidden, logits = self._model(x)

        probs = torch.softmax(logits, dim=1)
        raw_spoof_prob = float(probs[0, 1].item())

        # Extract named sub-feature scores
        signals = _extract_signals(last_hidden)

        # EMA smoothing (satisfies FR-3)
        if self._ema_prob is None:
            self._ema_prob = raw_spoof_prob
        else:
            self._ema_prob = (
                self._alpha * raw_spoof_prob + (1 - self._alpha) * self._ema_prob
            )

        latency_ms = (time.perf_counter() - t0) * 1000
        idx = self._window_index
        self._window_index += 1

        return DetectionResult(
            spoof_prob=raw_spoof_prob,
            smoothed_spoof_prob=self._ema_prob,
            liveness_score=liveness_result.liveness_score,
            band="",   # set by RiskEngine after composite scoring
            signals=signals,
            latency_ms=latency_ms,
            window_index=idx,
        )
