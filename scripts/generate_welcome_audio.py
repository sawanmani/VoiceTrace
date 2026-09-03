"""
VoiceTrace — scripts/generate_welcome_audio.py

Generate the welcome audio message for Asterisk Playback().
Output: 8kHz mono WAV (required by Asterisk).

Usage:
    python scripts/generate_welcome_audio.py
"""

import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def generate_welcome_audio():
    """Generate welcome message WAV at 8kHz mono for Asterisk."""
    output_dir = Path("deploy/asterisk/audio")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "voicetrace-welcome.wav"

    try:
        import pyttsx3
        engine = pyttsx3.init()

        # Generate at default SR first
        temp_path = output_dir / "_temp_welcome.wav"
        engine.save_to_file(
            "VoiceTrace active. This call is being monitored for AI voice cloning.",
            str(temp_path),
        )
        engine.runAndWait()

        # Load and resample to 8kHz mono
        audio, sr = sf.read(str(temp_path), dtype="float32")

        # Stereo to mono
        if audio.ndim > 1:
            audio = audio.mean(axis=1)

        # Resample to 8kHz if needed
        if sr != 8000:
            from scipy.signal import resample_poly
            from math import gcd
            g = gcd(8000, sr)
            up, down = 8000 // g, sr // g
            print(f"Resampling {sr}Hz -> 8000Hz (up={up}, down={down})")
            audio = resample_poly(audio, up, down).astype(np.float32)

        # Save as 8kHz mono WAV
        sf.write(str(output_path), audio, 8000, subtype="PCM_16")

        # Cleanup temp
        temp_path.unlink(missing_ok=True)

    except ImportError:
        print("pyttsx3 not available. Generating 2-second silence placeholder...")
        # Generate 2 seconds of silence as placeholder
        silence = np.zeros(8000 * 2, dtype=np.float32)
        sf.write(str(output_path), silence, 8000, subtype="PCM_16")

    # Verify
    info = sf.info(str(output_path))
    print(f"\n{'='*50}")
    print(f"Welcome audio generated:")
    print(f"  File: {output_path}")
    print(f"  Duration: {info.duration:.2f}s")
    print(f"  Sample Rate: {info.samplerate}Hz")
    print(f"  Channels: {info.channels}")
    print(f"  Format: {info.subtype}")
    print(f"{'='*50}")

    if info.samplerate != 8000:
        print("\n\u26a0\ufe0f  WARNING: Sample rate is not 8000Hz! Asterisk may play at wrong speed.")
    else:
        print("\n\u2705 Audio is correctly formatted for Asterisk.")

    print(f"\n\U0001f4cb Copy to WSL2:")
    print(f"  wsl -e sudo cp /mnt/c/voicetrace/deploy/asterisk/audio/voicetrace-welcome.wav /var/lib/asterisk/sounds/custom/voicetrace-welcome.wav")


if __name__ == "__main__":
    generate_welcome_audio()
