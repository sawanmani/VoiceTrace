"""
Generate deepfake test WAV files using edge-tts (Microsoft Azure Neural TTS).
These are AI-synthesized voices — exactly what AASIST-L is trained to detect.
"""
import asyncio
import sys
from pathlib import Path

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"
SAMPLES_DIR.mkdir(exist_ok=True)

# Multiple voices and languages to generate diverse deepfake samples
SAMPLES = [
    {
        "filename": "deepfake_english_female.wav",
        "voice": "en-US-JennyNeural",
        "text": (
            "Hello, I am calling from your bank's fraud prevention department. "
            "We have detected suspicious activity on your account. "
            "For your security, I need to verify your identity. "
            "Could you please confirm your full name and date of birth?"
        ),
    },
    {
        "filename": "deepfake_english_male.wav",
        "voice": "en-US-GuyNeural",
        "text": (
            "Good afternoon. This is a follow-up call regarding your recent "
            "account application. We need to process a verification step. "
            "Please state your account number and the last four digits of your "
            "social security number for confirmation."
        ),
    },
    {
        "filename": "deepfake_hindi_female.wav",
        "voice": "hi-IN-SwaraNeural",
        "text": (
            "Namaste, main aapke bank se bol rahi hoon. Aapke khate mein kuch "
            "asaamanya gatividhi dekhi gayi hai. Kripya apna khata number aur "
            "janm tithi bataiye taaki hum aapki pehchaan verify kar sakein."
        ),
    },
    {
        "filename": "deepfake_hindi_male.wav",
        "voice": "hi-IN-MadhurNeural",
        "text": (
            "Namaskar, yeh aapke insurance company se call hai. Aapki policy "
            "ka renewal pending hai aur aaj last date hai. Kripya apna policy "
            "number confirm karein aur payment ke liye apna card number bataiye."
        ),
    },
]


async def generate_sample(voice: str, text: str, out_wav: Path):
    """Generate a single TTS sample and convert to 16kHz mono WAV."""
    import edge_tts

    mp3_path = out_wav.with_suffix(".mp3")
    
    print(f"  Generating: {out_wav.name} ({voice})...")
    communicate = edge_tts.Communicate(text, voice, rate="-5%")
    await communicate.save(str(mp3_path))
    
    # Convert MP3 → 16kHz mono WAV
    try:
        from pydub import AudioSegment
        audio_seg = AudioSegment.from_mp3(str(mp3_path))
        audio_seg = audio_seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        audio_seg.export(str(out_wav), format="wav")
    except ImportError:
        # Fallback: try soundfile
        import soundfile as sf
        import numpy as np
        data, sr = sf.read(str(mp3_path), dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        # Simple resampling if needed
        if sr != 16000:
            import warnings
            warnings.filterwarnings("ignore")
            try:
                import librosa
                data = librosa.resample(data, orig_sr=sr, target_sr=16000)
            except ImportError:
                # Manual linear interpolation resampling
                ratio = 16000 / sr
                n_samples = int(len(data) * ratio)
                indices = np.linspace(0, len(data) - 1, n_samples)
                data = np.interp(indices, np.arange(len(data)), data)
        sf.write(str(out_wav), data, 16000)
    
    # Clean up MP3
    mp3_path.unlink(missing_ok=True)
    
    file_size = out_wav.stat().st_size
    duration_sec = file_size / (16000 * 2)  # 16kHz, 16-bit
    print(f"  [OK] {out_wav.name}: {file_size:,} bytes (~{duration_sec:.1f}s)")


async def main():
    print("=" * 60)
    print("VoiceTrace — Deepfake Sample Generator")
    print("Using edge-tts (Microsoft Azure Neural TTS)")
    print("=" * 60)
    print()
    
    generated = 0
    for sample in SAMPLES:
        out_path = SAMPLES_DIR / sample["filename"]
        if out_path.exists():
            print(f"  [SKIP] {sample['filename']} already exists, skipping")
            generated += 1
            continue
        try:
            await generate_sample(sample["voice"], sample["text"], out_path)
            generated += 1
        except Exception as e:
            print(f"  [FAIL] Failed to generate {sample['filename']}: {e}")
    
    print()
    print(f"Generated {generated}/{len(SAMPLES)} deepfake samples in: {SAMPLES_DIR}")
    print()
    print("Test with:")
    print(f'  curl -X POST http://localhost:8000/analyze -H "X-Api-Key: <key>" -F "file=@samples/deepfake_english_female.wav"')
    print()
    print("Expected: risk_score >= 65, band = 'high'")


if __name__ == "__main__":
    asyncio.run(main())
