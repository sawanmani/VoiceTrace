"""
VoiceTrace — scripts/generate_demo_samples.py

Generate demo audio samples for SIH 2026 presentation.
Creates genuine speech and TTS samples at 8kHz mono (Asterisk-compatible).

Usage:
    python scripts/generate_demo_samples.py
"""

import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def _text_to_wav(text: str, output_path: Path, target_sr: int = 8000):
    """Generate speech WAV from text using pyttsx3, resampled to target SR."""
    import pyttsx3
    engine = pyttsx3.init()

    temp_path = output_path.parent / f"_temp_{output_path.stem}.wav"
    engine.save_to_file(text, str(temp_path))
    engine.runAndWait()

    audio, sr = sf.read(str(temp_path), dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    if sr != target_sr:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(target_sr, sr)
        audio = resample_poly(audio, target_sr // g, sr // g).astype(np.float32)

    sf.write(str(output_path), audio, target_sr, subtype="PCM_16")
    temp_path.unlink(missing_ok=True)

    info = sf.info(str(output_path))
    print(f"  \u2705 {output_path.name}: {info.duration:.1f}s, {info.samplerate}Hz, {output_path.stat().st_size // 1024}KB")


def main():
    output_dir = Path("samples")
    output_dir.mkdir(exist_ok=True)

    print("\nGenerating VoiceTrace demo samples for SIH 2026...\n")

    samples = [
        (
            "demo_genuine_english.wav",
            "Hello, this is a genuine human voice speaking naturally. "
            "I am calling regarding my bank account balance inquiry. "
            "My name is Rajesh Kumar and I would like to check my recent transactions.",
        ),
        (
            "demo_genuine_hindi.wav",
            "Namaste, main apna bank account balance check karna chahta hoon. "
            "Mera naam Rajesh Kumar hai aur mujhe apne recent transactions dekhne hain.",
        ),
        (
            "demo_tts_clone.wav",
            "This is an AI generated voice clone attempting to impersonate a real person. "
            "Please transfer fifty thousand rupees to account number one two three four five.",
        ),
    ]

    try:
        for filename, text in samples:
            _text_to_wav(text, output_dir / filename)
    except ImportError:
        print("  \u26a0\ufe0f  pyttsx3 not installed. Run: pip install pyttsx3")
        return

    print(f"\n{'='*50}")
    print(f"\u2705 All demo samples generated in {output_dir}/")
    print(f"{'='*50}")
    print(f"\nUsage:")
    print(f"  python tests/test_audiosocket_client.py --file samples/demo_genuine_english.wav")
    print(f"  python tests/test_audiosocket_client.py --file samples/demo_tts_clone.wav")


if __name__ == "__main__":
    main()
