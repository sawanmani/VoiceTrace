"""
VoiceTrace — Phase 1: Static file inference with AASIST-L.

Usage:
    python -m detector.inference <path_to_wav_file>

Loads the pretrained AASIST-L checkpoint, accepts a WAV file path,
resamples to 16kHz mono if needed, runs inference, and prints a
spoof-probability between 0 and 1.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

# Import the vendored AASIST model
from detector.aasist_model import Model


# ─── AASIST-L model config (from config/AASIST-L.conf in clovaai/aasist) ───
AASIST_L_CONFIG = {
    "architecture": "AASIST",
    "nb_samp": 64600,          # ~4.04 s at 16kHz
    "first_conv": 128,
    "filts": [70, [1, 32], [32, 32], [32, 24], [24, 24]],
    "gat_dims": [24, 32],
    "pool_ratios": [0.4, 0.5, 0.7, 0.5],
    "temperatures": [2.0, 2.0, 100.0, 100.0],
}

# Expected sample rate
TARGET_SR = 16000

# Default checkpoint path (relative to project root)
DEFAULT_CHECKPOINT = Path(__file__).resolve().parent.parent / "models" / "weights" / "AASIST-L.pth"


def load_model(checkpoint_path: Path, device: str = "cpu") -> Model:
    """
    Instantiate AASIST-L and load pretrained weights.

    Args:
        checkpoint_path: Path to the .pth checkpoint file.
        device: 'cpu' or 'cuda'.

    Returns:
        The model in eval mode.
    """
    if not checkpoint_path.exists():
        raise FileNotFoundError(
            f"Checkpoint not found at {checkpoint_path}\n"
            "You need to download the pretrained AASIST-L checkpoint.\n"
            "Run: python -m detector.inference --help"
        )

    model = Model(AASIST_L_CONFIG)
    model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model = model.to(device)
    model.eval()

    num_params = sum(p.numel() for p in model.parameters())
    print(f"[INFO] Loaded AASIST-L — {num_params:,} parameters on {device}")
    return model


def load_audio(wav_path: str) -> np.ndarray:
    """
    Load a WAV file and resample to 16kHz mono if needed.

    Uses soundfile for reading. If the sample rate differs from 16kHz,
    we use librosa.resample (which must be installed).

    Returns:
        1-D numpy float32 array of samples at 16kHz.
    """
    audio, sr = sf.read(wav_path, dtype="float32")

    # Convert stereo to mono
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
        print(f"[INFO] Converted stereo → mono")

    # Resample if needed (using scipy polyphase)
    if sr != TARGET_SR:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(TARGET_SR, sr)
        up, down = TARGET_SR // g, sr // g
        print(f"[INFO] Resampling {sr}Hz → {TARGET_SR}Hz")
        audio = resample_poly(audio, up, down).astype(np.float32)

    return audio.astype(np.float32)


def pad_or_trim(audio: np.ndarray, target_len: int) -> np.ndarray:
    """
    AASIST expects exactly `nb_samp` (64600) samples.
    - If empty: return silence.
    - If shorter: repeat-pad to fill.
    - If longer: take the first `target_len` samples.
    """
    if len(audio) == 0:
        return np.zeros(target_len, dtype=np.float32)
    if len(audio) < target_len:
        repeats = (target_len // len(audio)) + 1
        audio = np.tile(audio, repeats)
    return audio[:target_len]



def infer(model: Model, audio: np.ndarray, device: str = "cpu") -> float:
    """
    Run AASIST-L inference on a single audio waveform.

    Args:
        model: Loaded AASIST-L model in eval mode.
        audio: 1-D numpy array, 16kHz mono, float32.
        device: 'cpu' or 'cuda'.

    Returns:
        Spoof probability (0.0 = definitely genuine, 1.0 = definitely spoofed).
    """
    nb_samp = AASIST_L_CONFIG["nb_samp"]
    audio = pad_or_trim(audio, nb_samp)

    # Shape: (1, nb_samp)
    x = torch.FloatTensor(audio).unsqueeze(0).to(device)

    with torch.no_grad():
        _, logits = model(x)  # model returns (last_hidden, output)

    # The model outputs two logits: index 0 = bonafide, index 1 = spoof.
    # Apply softmax to get probabilities.
    probs = torch.softmax(logits, dim=1)
    spoof_prob = probs[0, 1].item()

    return spoof_prob


def main():
    parser = argparse.ArgumentParser(
        description="VoiceTrace Phase 1 — Run AASIST-L inference on a single WAV file.",
        epilog="""
CHECKPOINT DOWNLOAD INSTRUCTIONS:
──────────────────────────────────
The official AASIST repo provides pretrained weights inside the repo itself.

  1. Clone the repo:
     git clone https://github.com/clovaai/aasist.git

  2. The pretrained AASIST-L checkpoint is at:
     aasist/models/weights/AASIST-L.pth

  3. Copy it to YOUR project:
     mkdir -p models/weights
     cp aasist/models/weights/AASIST-L.pth models/weights/AASIST-L.pth

  Alternatively, pass the checkpoint path directly:
     python -m detector.inference --checkpoint aasist/models/weights/AASIST-L.pth test.wav
""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "wav_path",
        type=str,
        help="Path to the WAV file to analyze.",
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=str(DEFAULT_CHECKPOINT),
        help=f"Path to AASIST-L .pth checkpoint (default: {DEFAULT_CHECKPOINT})",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Device to run inference on (default: auto-detect).",
    )
    args = parser.parse_args()

    # Validate WAV file
    wav_path = Path(args.wav_path)
    if not wav_path.exists():
        print(f"ERROR: WAV file not found: {wav_path}")
        sys.exit(1)

    # Load model
    checkpoint = Path(args.checkpoint)
    model = load_model(checkpoint, args.device)

    # Load and preprocess audio
    audio = load_audio(str(wav_path))
    duration = len(audio) / TARGET_SR
    print(f"[INFO] Audio: {wav_path.name} — {duration:.2f}s, {len(audio)} samples")

    # Run inference
    spoof_prob = infer(model, audio, args.device)

    # Output results
    print()
    print("=" * 50)
    print(f"  File:             {wav_path.name}")
    print(f"  Spoof Probability: {spoof_prob:.4f}")
    print(f"  Verdict:          {'SPOOFED' if spoof_prob > 0.5 else 'GENUINE'}")
    print("=" * 50)
    print()

    # Return exit code: 0 = genuine, 1 = spoofed
    sys.exit(0 if spoof_prob <= 0.5 else 1)


if __name__ == "__main__":
    main()
