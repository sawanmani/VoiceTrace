import base64
import io

import numpy as np
import soundfile as sf

from server.audio_utils import (
    _lufs_normalize,
    _resample,
    _to_mono,
    _ulaw_to_linear,
    bytes_to_pcm,
    decode_twilio_chunk,
    file_bytes_to_pcm,
)
from server.config import TARGET_SR


def test_stereo_audio_is_converted_to_mono():
    left = np.array([0.2, 0.4, 0.6], dtype=np.float32)
    right = np.array([0.4, 0.6, 0.8], dtype=np.float32)

    stereo = np.column_stack((left, right))

    mono = _to_mono(stereo)

    expected = np.array([0.3, 0.5, 0.7], dtype=np.float32)

    assert mono.dtype == np.float32
    np.testing.assert_allclose(mono, expected)


def test_mono_audio_remains_mono():
    audio = np.array([0.1, 0.2, 0.3], dtype=np.float32)

    result = _to_mono(audio)

    assert result.dtype == np.float32
    np.testing.assert_allclose(result, audio)


def test_resampling_changes_sample_count():
    audio = np.zeros(8000, dtype=np.float32)

    result = _resample(audio, 8000, TARGET_SR)

    assert result.dtype == np.float32
    assert len(result) == 16000


def test_lufs_normalization_preserves_silence():
    audio = np.zeros(16000, dtype=np.float32)

    result = _lufs_normalize(audio)

    np.testing.assert_array_equal(result, audio)


def test_lufs_normalization_changes_quiet_audio():
    audio = np.full(16000, 0.001, dtype=np.float32)

    result = _lufs_normalize(audio)

    assert result.dtype == np.float32
    assert np.sqrt(np.mean(result ** 2)) > np.sqrt(np.mean(audio ** 2))


def test_file_bytes_to_pcm_returns_16khz_mono_float32():
    sample_rate = 8000

    t = np.arange(sample_rate, dtype=np.float32) / sample_rate
    audio = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV")

    result = file_bytes_to_pcm(buffer.getvalue())

    assert result.dtype == np.float32
    assert result.ndim == 1
    assert len(result) == TARGET_SR


def test_file_bytes_to_pcm_downmixes_stereo():
    sample_rate = 16000

    left = np.full(sample_rate, 0.1, dtype=np.float32)
    right = np.full(sample_rate, 0.3, dtype=np.float32)

    stereo = np.column_stack((left, right))

    buffer = io.BytesIO()
    sf.write(buffer, stereo, sample_rate, format="WAV")

    result = file_bytes_to_pcm(buffer.getvalue())

    assert result.dtype == np.float32
    assert result.ndim == 1
    assert len(result) == TARGET_SR


def test_bytes_to_pcm_accepts_raw_float32():
    sample_rate = TARGET_SR

    audio = np.linspace(
        -0.1,
        0.1,
        sample_rate,
        dtype=np.float32,
    )

    raw_bytes = audio.tobytes()

    result, result_sr = bytes_to_pcm(raw_bytes, sr=sample_rate)

    assert result.dtype == np.float32
    assert result.ndim == 1
    assert result_sr == TARGET_SR


def test_twilio_chunk_decodes_to_16khz():
    # A sequence of valid G.711 mu-law bytes.
    ulaw_bytes = bytes([255] * 8000)

    payload = base64.b64encode(ulaw_bytes).decode("ascii")

    result = decode_twilio_chunk(payload)

    assert result.dtype == np.float32
    assert result.ndim == 1
    assert len(result) == TARGET_SR


def test_ulaw_decode_returns_integer():
    for value in [0, 1, 127, 128, 254, 255]:
        result = _ulaw_to_linear(value)

        assert isinstance(result, (int, np.integer))