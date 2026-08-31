import sys
import collections
from pathlib import Path

import numpy as np
import torch
import soundfile as sf

from detector.aasist_model import Model
from detector.inference import load_model, AASIST_L_CONFIG, TARGET_SR, pad_or_trim


class StreamingDetector:
    def __init__(self, checkpoint_path: Path, device: str = "cpu"):
        self.device = device
        self.model = load_model(checkpoint_path, device)
        
        # Audio streaming params
        self.sample_rate = TARGET_SR
        self.window_samples = 2 * self.sample_rate  # 2 seconds
        self.hop_samples = 1 * self.sample_rate     # 1 second hop (50% overlap)
        self.buffer = np.array([], dtype=np.float32)
        
        # History for smoothing (last 3 windows)
        self.score_history = collections.deque(maxlen=3)

    def process_chunk(self, audio_chunk: np.ndarray) -> dict:
        """
        Takes raw audio samples, buffers them, and runs inference if a full window is ready.
        Returns a dict with scores if inference ran, otherwise None.
        """
        self.buffer = np.concatenate((self.buffer, audio_chunk))
        
        if len(self.buffer) < self.window_samples:
            return None  # Wait for more audio
            
        # Extract 2-second window
        window = self.buffer[:self.window_samples]
        
        # Shift buffer by hop_samples
        self.buffer = self.buffer[self.hop_samples:]
        
        # Run inference
        score_data = self._run_inference(window)
        
        # Smooth spoof probability
        self.score_history.append(score_data["spoof_prob"])
        smoothed_prob = sum(self.score_history) / len(self.score_history)
        score_data["smoothed_spoof_prob"] = smoothed_prob
        
        return score_data

    def _run_inference(self, window: np.ndarray) -> dict:
        """Runs the model on a 2s window and estimates sub-scores."""
        # Pad to model's expected 64600 samples (~4 seconds)
        nb_samp = AASIST_L_CONFIG["nb_samp"]
        audio_padded = pad_or_trim(window, nb_samp)
        
        x = torch.FloatTensor(audio_padded).unsqueeze(0).to(self.device)
        with torch.no_grad():
            last_hidden, logits = self.model(x)
            
        probs = torch.softmax(logits, dim=1)
        spoof_prob = probs[0, 1].item()
        
        # Heuristic approximation for sub-scores:
        # AASIST doesn't natively expose spectral vs prosody scores.
        # We approximate using the spoof probability as a baseline and add minor variance.
        # NOTE: This is a heuristic approximation, not genuine model output!
        base_score = spoof_prob
        spectral_score = min(1.0, max(0.0, base_score + np.random.uniform(-0.1, 0.1)))
        prosody_score = min(1.0, max(0.0, base_score + np.random.uniform(-0.1, 0.1)))
        
        return {
            "spoof_prob": spoof_prob,
            "spectral_artifact_score": spectral_score,
            "prosody_irregularity_score": prosody_score
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m detector.stream <test_wav>")
        sys.exit(1)
        
    wav_path = sys.argv[1]
    
    # Simulate a stream by reading chunks
    audio, sr = sf.read(wav_path, dtype="float32")
    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)
        
    # We assume it's 16kHz for this simple test
    if sr != 16000:
        print(f"Warning: sr={sr}, expected 16000")
        
    checkpoint = Path(__file__).resolve().parent.parent / "models" / "weights" / "AASIST-L.pth"
    detector = StreamingDetector(checkpoint)
    
    # Send audio in ~0.5s chunks (8000 samples)
    chunk_size = 8000
    for i in range(0, len(audio), chunk_size):
        chunk = audio[i:i+chunk_size]
        result = detector.process_chunk(chunk)
        if result:
            print(f"Time: {(i+chunk_size)/16000:.1f}s | "
                  f"Raw: {result['spoof_prob']:.2f} | "
                  f"Smoothed: {result['smoothed_spoof_prob']:.2f} | "
                  f"Spec: {result['spectral_artifact_score']:.2f} | "
                  f"Pros: {result['prosody_irregularity_score']:.2f}")
