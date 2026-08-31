import numpy as np

from detector.streaming import LivenessChecker
from server.config import (
    CLIPPING_FRACTION_LIMIT,
    CLIPPING_THRESHOLD,
    SILENCE_THRESHOLD,
    ZCR_MAX,
    ZCR_MIN,
)


def test_silence_is_detected():
    checker = LivenessChecker()

    audio = np.zeros(16000, dtype=np.float32)

    result = checker.check(audio)

    assert result.is_silent is True
    assert result.liveness_score == 0.0


def test_normal_audio_is_not_silent():
    checker = LivenessChecker()

    rng = np.random.default_rng(42)
    audio = rng.normal(0, 0.05, 16000).astype(np.float32)

    result = checker.check(audio)

    assert result.is_silent is False
    assert result.detail["rms"] > SILENCE_THRESHOLD


def test_clipping_is_detected():
    checker = LivenessChecker()

    audio = np.zeros(16000, dtype=np.float32)

    clipped_samples = int(16000 * (CLIPPING_FRACTION_LIMIT + 0.05))
    audio[:clipped_samples] = CLIPPING_THRESHOLD + 0.1

    result = checker.check(audio)

    assert result.has_clipping is True


def test_liveness_score_is_between_zero_and_one():
    checker = LivenessChecker()

    rng = np.random.default_rng(123)
    audio = rng.normal(0, 0.05, 16000).astype(np.float32)

    result = checker.check(audio)

    assert 0.0 <= result.liveness_score <= 1.0


def test_result_contains_diagnostic_details():
    checker = LivenessChecker()

    rng = np.random.default_rng(456)
    audio = rng.normal(0, 0.05, 16000).astype(np.float32)

    result = checker.check(audio)

    assert "rms" in result.detail
    assert "clipped_fraction" in result.detail
    assert "noise_floor_variance" in result.detail
    assert "zcr" in result.detail


def test_zcr_value_is_valid():
    checker = LivenessChecker()

    # Generate a simple alternating signal to produce a high ZCR.
    audio = np.tile(
        np.array([-0.1, 0.1], dtype=np.float32),
        8000,
    )

    result = checker.check(audio)

    assert "zcr" in result.detail
    assert 0.0 <= result.detail["zcr"] <= 1.0