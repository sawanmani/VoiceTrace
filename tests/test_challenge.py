import numpy as np
import pytest
from unittest.mock import patch, MagicMock

from server.challenge import ChallengeManager, build_challenge_pool

@pytest.fixture
def mock_challenge_dir(tmp_path):
    with patch("server.challenge._CHALLENGE_POOL_DIR", tmp_path):
        yield tmp_path

def test_build_challenge_pool_creates_files(mock_challenge_dir):
    # Mock _render_one to just touch the file and return True
    def mock_render(text, out_path):
        out_path.touch()
        return True
        
    with patch("server.challenge._render_one", side_effect=mock_render) as mock_render_call:
        with patch("server.challenge._POOL_SIZE", 5):
            count = build_challenge_pool()
            assert count == 5
            assert mock_render_call.call_count == 5
            
            files = list(mock_challenge_dir.glob("*.wav"))
            assert len(files) == 5

def test_pick_challenge_returns_none_if_empty(mock_challenge_dir):
    manager = ChallengeManager()
    res = manager.pick_challenge()
    assert res is None

def test_pick_challenge_returns_valid_data(mock_challenge_dir):
    # Create a dummy valid wav file
    dummy_wav = mock_challenge_dir / "1234.wav"
    import soundfile as sf
    dummy_data = np.zeros(16000, dtype=np.float32)
    sf.write(dummy_wav, dummy_data, 16000)

    manager = ChallengeManager()
    res = manager.pick_challenge()
    assert res is not None
    assert res["expected_text"] == "1234"
    assert res["prompt"] == "Please repeat: 1 2 3 4"
    assert len(res["audio_pcm"]) == 16000

def test_encode_challenge_b64():
    manager = ChallengeManager()
    audio = np.array([0.0, 1.0, -1.0], dtype=np.float32)
    chal = {"audio_pcm": audio}
    b64_str = manager.encode_challenge_b64(chal)
    assert isinstance(b64_str, str)
    assert len(b64_str) > 0

@patch("server._model_cache.get_asr_model")
def test_verify_response_success(mock_get_asr):
    mock_asr = MagicMock()
    # transcribe_batch returns (transcriptions, ...) where transcriptions is a list of strings
    mock_asr.transcribe_batch.return_value = [["one two three four"]]
    
    # Needs to handle .mods.parameters().device
    mock_param = MagicMock()
    mock_param.device = "cpu"
    mock_asr.mods.parameters.return_value = iter([mock_param])
    
    mock_get_asr.return_value = mock_asr

    manager = ChallengeManager()
    audio = np.zeros(16000, dtype=np.float32)
    result = manager.verify_response("1234", audio)
    assert result is True

@patch("server._model_cache.get_asr_model")
def test_verify_response_failure(mock_get_asr):
    mock_asr = MagicMock()
    mock_asr.transcribe_batch.return_value = [["nine nine nine nine"]]
    
    mock_param = MagicMock()
    mock_param.device = "cpu"
    mock_asr.mods.parameters.return_value = iter([mock_param])
    
    mock_get_asr.return_value = mock_asr

    manager = ChallengeManager()
    audio = np.zeros(16000, dtype=np.float32)
    result = manager.verify_response("1234", audio)
    assert result is False
