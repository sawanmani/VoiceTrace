"""
VoiceTrace — tests/test_batch_worker.py

Unit and regression tests for the core streaming and scoring pipeline.
All tests are self-contained (no real AASIST model or GPU required).
"""
import types
import sys
import collections
import threading

import numpy as np
import pytest


# ── Shared fixtures ───────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def patch_server_config(monkeypatch):
    """Inject a fake server.config so tests don't need config.yaml."""
    fake = types.ModuleType("server.config")
    fake.WINDOW_SEC = 1.0
    fake.STRIDE_SEC = 0.5
    fake.SMOOTHING_ALPHA = 0.35
    fake.TARGET_SR = 16000
    fake.NB_SAMP = 64600
    fake.SILENCE_THRESHOLD = 0.002
    fake.CLIPPING_THRESHOLD = 0.98
    fake.CLIPPING_FRACTION_LIMIT = 0.01
    fake.NOISE_FLOOR_VARIANCE_MIN = 1e-6
    fake.ZCR_MIN = 0.01
    fake.ZCR_MAX = 0.45
    fake.THRESHOLD_UNCERTAIN = 25
    fake.THRESHOLD_MEDIUM = 35
    fake.THRESHOLD_HIGH = 65
    fake.WEIGHTS = {
        "spoof_prob": 0.5,
        "liveness": 0.2,
        "caller_context": 0.15,
        "transaction_context": 0.15,
    }
    fake.RECOMMENDATIONS = {
        "low": "No action required.",
        "uncertain": "Monitor closely.",
        "medium": "Request verification.",
        "high": "Recommend callback before any transfer.",
    }
    monkeypatch.setitem(sys.modules, "server.config", fake)


# ── Test 1: StreamingDetector buffers audio and emits a ready window ──────

def test_streaming_detector_windowing():
    """
    push() correctly accumulates audio and get_ready_window() returns a
    numpy array of the expected length once enough audio is buffered.
    """
    from detector.streaming import StreamingDetector
    detector = StreamingDetector()

    SR = 16000
    # Push exactly 1 second of silence — should trigger one ready window
    chunk = np.zeros(SR, dtype=np.float32)
    detector.push(chunk)

    window = detector.get_ready_window()
    assert window is not None, "Expected a ready window after 1s of audio"
    assert isinstance(window, np.ndarray)
    assert len(window) == SR, f"Expected {SR} samples, got {len(window)}"


# ── Test 2: get_ready_window returns writable, owned memory ───────────────

def test_get_ready_window_is_writable():
    """
    The window returned by get_ready_window() must be a writable, independent
    copy — not a read-only np.frombuffer view. This guards against the B2 class
    of bug where LivenessChecker's in-place ZCR write raises ValueError.
    """
    from detector.streaming import StreamingDetector
    detector = StreamingDetector()

    SR = 16000
    audio = np.random.randn(2 * SR).astype(np.float32)
    detector.push(audio)

    window = detector.get_ready_window()
    assert window is not None
    assert window.flags.writeable, "Window must be writable (not a frombuffer view)"

    # Simulate the exact in-place write that was crashing in LivenessChecker
    signs = np.sign(window)
    signs[signs == 0] = 1   # raises ValueError if window is read-only


# ── Test 3: RiskEngine scoring and band thresholds ────────────────────────

def test_risk_score_calculation():
    """
    RiskEngine.score() produces a valid RiskEvent with correct band
    classification and non-empty signal breakdown.
    """
    from server.risk_engine import RiskEngine, CallContext
    from detector.streaming import DetectionResult

    engine = RiskEngine()
    context = CallContext()

    result = DetectionResult(
        spoof_prob=0.8,
        smoothed_spoof_prob=0.75,
        liveness_score=0.9,
        band="high",
        signals={"spectral_artifact_score": 0.8},
        window_index=1,
        latency_ms=50.0,
    )

    risk_event = engine.score(result, "test_call", context)
    assert risk_event.risk_score >= 0
    assert risk_event.risk_score <= 100
    assert risk_event.band in ["low", "uncertain", "medium", "high"]
    assert risk_event.call_id == "test_call"
    assert isinstance(risk_event.signals, dict)
    assert len(risk_event.signals) > 0


# ── Test 4: band_from_score covers all threshold boundaries ───────────────

def test_band_from_score_thresholds():
    """band_from_score() must correctly map all four risk zones."""
    from server.risk_engine import band_from_score

    assert band_from_score(0)   == "low"
    assert band_from_score(24)  == "low"
    assert band_from_score(25)  == "uncertain"
    assert band_from_score(34)  == "uncertain"
    assert band_from_score(35)  == "medium"
    assert band_from_score(64)  == "medium"
    assert band_from_score(65)  == "high"
    assert band_from_score(100) == "high"


# ── Test 5: bytes_to_pcm raw-PCM fallback returns writable array ──────────

def test_bytes_to_pcm_raw_fallback_is_writable():
    """
    The raw float32 fallback in bytes_to_pcm must return a writable array.
    Previously np.frombuffer returned read-only memory and nan_to_num(copy=False)
    would crash on it.
    """
    from server.audio_utils import bytes_to_pcm

    # Manufacture raw float32 bytes (1 second of 16kHz silence)
    SR = 16000
    silence = np.zeros(SR, dtype=np.float32)
    raw_bytes = silence.tobytes()

    audio, out_sr = bytes_to_pcm(raw_bytes, sr=SR)
    assert out_sr == SR
    assert audio.flags.writeable, "bytes_to_pcm output must be writable"
    # Confirm in-place write doesn't raise
    np.nan_to_num(audio, copy=False, nan=0.0)


# ── Test 6: RiskEngine composite formula direction ────────────────────────

def test_risk_engine_high_spoof_raises_score():
    """
    A detection with high spoof probability must produce a higher risk score
    than one with low spoof probability, all else equal.
    """
    from server.risk_engine import RiskEngine, CallContext
    from detector.streaming import DetectionResult

    engine = RiskEngine()

    def make_result(spoof):
        return DetectionResult(
            spoof_prob=spoof,
            smoothed_spoof_prob=spoof,
            liveness_score=0.5,
            band="low",
            signals={},
            window_index=0,
            latency_ms=10.0,
        )

    low_event  = engine.score(make_result(0.05), "c1")
    high_event = engine.score(make_result(0.95), "c2")

    assert high_event.risk_score > low_event.risk_score, (
        f"High spoof ({high_event.risk_score}) should exceed low spoof ({low_event.risk_score})"
    )
