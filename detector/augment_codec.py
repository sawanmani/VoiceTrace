"""
Codec-Realistic Augmentation Pipeline (F1)

This script takes clean 16kHz WAV files (like the ASVspoof dataset) and passes
them through realistic telephony codec bottlenecks (G.711 µ-law, A-law, AMR-NB).

This ensures the spoof detector is trained and evaluated on audio that actually
sounds like a phone call, reducing domain mismatch in production.
"""

import argparse
import subprocess
import tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
import concurrent.futures

def apply_ffmpeg_codec(input_path: Path, output_path: Path, codec: str, bitrate: str = None):
    """
    Pass audio through an ffmpeg codec and save the result.
    Common telephony codecs:
    - pcm_mulaw (G.711 µ-law, 8kHz)
    - pcm_alaw (G.711 A-law, 8kHz)
    - libopencore_amrnb (AMR Narrowband, 8kHz)
    """
    # Create an intermediate file to simulate the transcode
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_encoded:
        tmp_encoded_path = tmp_encoded.name

    try:
        # Encode
        cmd = [
            "ffmpeg", "-y", "-i", str(input_path),
            "-ar", "8000", "-c:a", codec
        ]
        if bitrate:
            cmd.extend(["-b:a", bitrate])
        cmd.append(tmp_encoded_path)
        
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        # Decode back to 16kHz PCM (what AASIST-L expects)
        cmd_decode = [
            "ffmpeg", "-y", "-i", tmp_encoded_path,
            "-ar", "16000", "-c:a", "pcm_s16le", str(output_path)
        ]
        subprocess.run(cmd_decode, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    finally:
        Path(tmp_encoded_path).unlink(missing_ok=True)

def process_file(file_path: Path, out_dir: Path, codecs: list):
    """Process a single file through randomly selected codec."""
    import random
    codec = random.choice(codecs)
    out_file = out_dir / f"{file_path.stem}_{codec}{file_path.suffix}"
    
    # AMR-NB bitrates (e.g. 12.2k, 7.4k, 4.75k)
    bitrate = "12.2k" if codec == "libopencore_amrnb" else None
    
    try:
        apply_ffmpeg_codec(file_path, out_file, codec, bitrate)
        return True, file_path
    except Exception as e:
        return False, f"{file_path}: {e}"

def main():
    parser = argparse.ArgumentParser(description="Apply telephony codecs to clean audio.")
    parser.add_argument("input_dir", type=str, help="Directory containing clean WAV files")
    parser.add_argument("output_dir", type=str, help="Directory to save degraded WAV files")
    parser.add_argument("--codecs", nargs="+", default=["pcm_mulaw", "pcm_alaw"], help="ffmpeg codecs to use")
    
    args = parser.parse_args()
    
    in_dir = Path(args.input_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    files = list(in_dir.glob("*.wav"))
    if not files:
        print(f"No WAV files found in {in_dir}")
        return

    print(f"Processing {len(files)} files into {out_dir} using codecs {args.codecs}...")
    
    success_count = 0
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = [executor.submit(process_file, f, out_dir, args.codecs) for f in files]
        for idx, future in enumerate(concurrent.futures.as_completed(futures)):
            ok, result = future.result()
            if ok:
                success_count += 1
            else:
                print(f"Error: {result}")
                
            if (idx + 1) % 100 == 0:
                print(f"Processed {idx + 1}/{len(files)}...")

    print(f"Done. Successfully degraded {success_count}/{len(files)} files.")

if __name__ == "__main__":
    main()
