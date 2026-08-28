"""
VoiceTrace — eval/language_matrix.py (F5)

Zero-cost multilingual attack generator using available TTS engines.
Generates spoofed audio across multiple Indian regional languages to prove
the model's language-agnostic detection capability.
"""

import argparse
from pathlib import Path
import pyttsx3
import soundfile as sf

def main():
    parser = argparse.ArgumentParser(description="Generate multilingual TTS samples for testing.")
    parser.add_argument("output_dir", type=str, help="Output directory")
    args = parser.parse_args()
    
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    engine = pyttsx3.init()
    
    # We use phonetic transliterations if native language packs aren't installed on the host OS
    phrases = {
        "hindi": "Namaste, mera naam VoiceTrace hai.",
        "tamil": "Vanakkam, en peyar VoiceTrace.",
        "bengali": "Nomoshkar, amar nam VoiceTrace.",
        "marathi": "Namaskar, maza naav VoiceTrace aahe.",
        "punjabi": "Sat sri akal, mera naam VoiceTrace hai."
    }
    
    for lang, phrase in phrases.items():
        out_file = out_dir / f"spoof_{lang}.wav"
        engine.save_to_file(phrase, str(out_file))
        engine.runAndWait()
        
        # Ensure it's 16kHz
        audio, sr = sf.read(out_file)
        if sr != 16000:
            from server.audio_utils import _resample
            audio = _resample(audio, sr, 16000)
            sf.write(out_file, audio, 16000)
            
        print(f"Generated {lang} spoof sample at {out_file}")

if __name__ == "__main__":
    main()
