# VoiceTrace — Demo Audio Samples

This directory holds audio samples used for the two scripted demo runs (Phase 5).

**Privacy note:** `RETAIN_AUDIO=false` in `config.yaml` means the server will never write
any of these files to disk during processing. Audio chunks are processed in RAM only.

---

## Sample Files

Place the following files in this directory before the demo:

| Filename | Description | Expected outcome |
|---|---|---|
| `genuine_sample.wav` | Real human voice recording (16 kHz, mono, WAV) | Risk stays **green** (< 35) |
| `cloned_sample.wav` | AI-synthesized / cloned voice (16 kHz, mono, WAV) | Risk escalates to **red** (≥ 65) |

---

## Where to Get Samples

### Option A — ASVspoof 2019 LA Dataset (Recommended)

The ASVspoof 2019 Logical Access (LA) dataset is the standard benchmark for anti-spoofing.

1. Register at https://www.asvspoof.org/index2019.html
2. Download the **LA** partition (not PA)
3. From `ASVspoof2019_LA_eval/flac/`:
   - Pick any file starting with `LA_E_` with label `bonafide` (genuine) → convert to WAV
   - Pick any file starting with `LA_E_` with label `spoof` → convert to WAV
4. Convert to 16 kHz mono WAV:
   ```
   ffmpeg -i LA_E_<genuine>.flac -ar 16000 -ac 1 genuine_sample.wav
   ffmpeg -i LA_E_<spoof>.flac -ar 16000 -ac 1 cloned_sample.wav
   ```

### Option B — Free TTS/Voice Cloning Tool

Generate a clone of a team member's voice using a free tool:

- **ElevenLabs** (free tier): https://elevenlabs.io — upload 1 minute of voice, generate a cloned reading
- **RVC (Retrieval-based Voice Conversion)**: open-source, runs locally
- **Bark** (Suno): https://github.com/suno-ai/bark — open-source TTS, often flagged as spoof

Record a genuine reading (team member reads a script into a microphone → `genuine_sample.wav`),
then generate the same script through the cloning tool → `cloned_sample.wav`.

---

## Virtual Microphone Setup (for Demo Injection)

To "play" a WAV file as if it were a live microphone input:

### Windows — VB-Audio Virtual Cable

1. Download **VB-Audio Virtual Cable** (free): https://vb-audio.com/Cable/
2. Install → reboot
3. Set "CABLE Input" as the default playback device
4. In the VoiceTrace Call page, select "CABLE Output" as the microphone input
5. Play `cloned_sample.wav` in Windows Media Player or VLC → it appears as mic input

### macOS — BlackHole

1. Install **BlackHole 2ch** (free): https://github.com/ExistentialAudio/BlackHole
2. Create a Multi-Output Device in Audio MIDI Setup (speakers + BlackHole)
3. In the VoiceTrace Call page, select "BlackHole 2ch" as mic input
4. Play `cloned_sample.wav` in QuickTime/VLC

### Linux — PulseAudio Loopback

```bash
pactl load-module module-loopback
# Set the loopback sink as mic source in the browser
```

---

## How to Test the Pipeline Without a Live Call

Use the REST endpoint to quickly verify a sample:

```bash
# From the project root (with server running)
curl -X POST http://localhost:8000/analyze \
  -H "X-Api-Key: <your_key>" \
  -F "file=@samples/cloned_sample.wav" \
  | python -m json.tool
```

A correctly configured system should return `band: "high"` for `cloned_sample.wav`.
