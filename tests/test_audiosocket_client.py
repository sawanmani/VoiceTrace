"""
VoiceTrace — tests/test_audiosocket_client.py

Standalone AudioSocket protocol test client.
Simulates what Asterisk does: sends UUID, streams audio, sends hangup.

Usage:
    # Test with genuine voice (should produce band=low)
    python tests/test_audiosocket_client.py --file samples/genuine_indian.wav

    # Test with spoofed voice (should produce band=high)
    python tests/test_audiosocket_client.py --file samples/spoof_hindi.wav

    # Run 3 concurrent calls (stress test)
    python tests/test_audiosocket_client.py --file samples/spoof_hindi.wav --concurrent 3

    # Custom server address
    python tests/test_audiosocket_client.py --host 127.0.0.1 --port 1579 --file samples/genuine_indian.wav
"""

import argparse
import asyncio
import struct
import sys
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

# AudioSocket constants (must match server/audiosocket_server.py)
MSG_HANGUP = 0x00
MSG_UUID = 0x01
MSG_AUDIO = 0x10
HEADER_FORMAT = ">BH"

# AudioSocket audio parameters
TARGET_SR = 8000          # AudioSocket expects 8kHz
CHUNK_SAMPLES = 160       # 20ms at 8kHz
CHUNK_BYTES = CHUNK_SAMPLES * 2  # 320 bytes (16-bit = 2 bytes/sample)


def load_and_prepare_audio(wav_path: str) -> np.ndarray:
    """Load audio file and convert to 8kHz mono int16 (AudioSocket format)."""
    audio, sr = sf.read(wav_path, dtype="float32")

    # Stereo to mono
    if audio.ndim > 1:
        audio = audio.mean(axis=1)

    # Resample to 8kHz if needed
    if sr != TARGET_SR:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(TARGET_SR, sr)
        up, down = TARGET_SR // g, sr // g
        audio = resample_poly(audio, up, down).astype(np.float32)

    # float32 -> int16 (AudioSocket format)
    audio_int16 = (audio * 32767).clip(-32768, 32767).astype(np.int16)
    return audio_int16


def make_packet(msg_type: int, payload: bytes) -> bytes:
    """Build an AudioSocket protocol packet: 3-byte header + payload."""
    header = struct.pack(HEADER_FORMAT, msg_type, len(payload))
    return header + payload


async def send_call(host: str, port: int, wav_path: str, call_index: int = 0) -> dict:
    """Simulate a complete AudioSocket call."""
    audio_int16 = load_and_prepare_audio(wav_path)
    total_samples = len(audio_int16)
    duration_sec = total_samples / TARGET_SR

    print(f"[Call {call_index}] Loaded {Path(wav_path).name}: "
          f"{duration_sec:.1f}s, {total_samples} samples")

    # Connect to AudioSocket server
    reader, writer = await asyncio.open_connection(host, port)
    print(f"[Call {call_index}] Connected to {host}:{port}")

    t0 = time.perf_counter()

    # Step 1: Send UUID packet (must be first message)
    call_uuid = uuid.uuid4()
    writer.write(make_packet(MSG_UUID, call_uuid.bytes))
    await writer.drain()
    print(f"[Call {call_index}] Sent UUID: {str(call_uuid)[:8]}")

    # Step 2: Stream audio in 20ms chunks (real-time simulation)
    chunks_sent = 0
    for i in range(0, total_samples, CHUNK_SAMPLES):
        chunk = audio_int16[i:i + CHUNK_SAMPLES]

        # Pad last chunk if shorter than 160 samples
        if len(chunk) < CHUNK_SAMPLES:
            padded = np.zeros(CHUNK_SAMPLES, dtype=np.int16)
            padded[:len(chunk)] = chunk
            chunk = padded

        writer.write(make_packet(MSG_AUDIO, chunk.tobytes()))
        await writer.drain()
        chunks_sent += 1

        # Simulate real-time: 20ms per chunk
        await asyncio.sleep(0.02)

        # Progress indicator every 1 second (50 chunks)
        if chunks_sent % 50 == 0:
            elapsed = time.perf_counter() - t0
            print(f"[Call {call_index}] Streaming... "
                  f"{chunks_sent * 0.02:.1f}s / {duration_sec:.1f}s")

    # Step 3: Send hangup
    writer.write(make_packet(MSG_HANGUP, b""))
    await writer.drain()

    elapsed = time.perf_counter() - t0
    print(f"[Call {call_index}] Completed: {chunks_sent} chunks, "
          f"{elapsed:.1f}s elapsed")

    # Close connection
    writer.close()
    await writer.wait_closed()

    return {
        "call_index": call_index,
        "wav_file": Path(wav_path).name,
        "duration_sec": round(duration_sec, 1),
        "chunks_sent": chunks_sent,
        "elapsed_sec": round(elapsed, 1),
        "uuid": str(call_uuid)[:8],
    }


async def main():
    parser = argparse.ArgumentParser(
        description="VoiceTrace AudioSocket Test Client"
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="AudioSocket server host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=int, default=1579,
        help="AudioSocket server port (default: 1579)",
    )
    parser.add_argument(
        "--file", required=True,
        help="WAV file to stream (e.g., samples/genuine_indian.wav)",
    )
    parser.add_argument(
        "--concurrent", type=int, default=1,
        help="Number of concurrent calls to simulate (default: 1)",
    )
    args = parser.parse_args()

    if not Path(args.file).exists():
        print(f"ERROR: File not found: {args.file}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  VoiceTrace AudioSocket Test Client")
    print(f"  Server: {args.host}:{args.port}")
    print(f"  File: {args.file}")
    print(f"  Concurrent calls: {args.concurrent}")
    print(f"{'='*60}\n")

    if args.concurrent == 1:
        result = await send_call(args.host, args.port, args.file)
        print(f"\nCall completed: {result}")
    else:
        tasks = [
            send_call(args.host, args.port, args.file, i)
            for i in range(args.concurrent)
        ]
        results = await asyncio.gather(*tasks)
        print(f"\n✅ All {len(results)} calls completed:")
        for r in results:
            print(f"   Call {r['call_index']}: {r['wav_file']} — "
                  f"{r['chunks_sent']} chunks in {r['elapsed_sec']}s")

    print(f"\n💡 Check dashboard at http://localhost:5173 for risk scores")
    print(f"💡 Check VoiceTrace server logs for detailed processing info")
    print(f"\n🧪 Verification Tests:")
    print(f"  1. genuine_indian.wav → expect band=low on dashboard")
    print(f"  2. spoof_hindi.wav → expect band=high on dashboard")
    print(f"  3. --concurrent 3 → 3 independent calls on dashboard")
    print(f"  4. pytest tests/ -v → all existing tests still pass\n")


if __name__ == "__main__":
    asyncio.run(main())
