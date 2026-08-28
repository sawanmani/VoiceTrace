# System Architecture

**Project:** VoiceTrace | **Developed by:** Team VoiceTracers | **Reference:** SIH 2026, PSID 260104

## 1. High-Level Data Flow

```
Audio source                 Detection layer              Scoring & delivery         UI
─────────────               ─────────────────             ──────────────────        ──────────
Mic / WebRTC   ─┐                                                                    Live gauge
Simulated file ─┼──► Chunker ──► StreamingDetector ──► RiskEngine ──► WebSocket ──►  Waveform
Twilio call    ─┘    (1-3s     (AASIST-L model)      (model +        broadcast       Explain panel
                      windows)                         context)                      Alert card
```

## 2. Components

### 2.1 Detector (`/detector`)
- Loads a pretrained spoof-detection checkpoint (AASIST-L).
- `StreamingDetector` buffers incoming PCM audio into overlapping windows and returns a smoothed spoof-probability per window, plus a breakdown of spectral and prosody artifact scores.
- Stateless with respect to storage — operates entirely in memory per call.

### 2.2 Server (`/server`)
- FastAPI application, three entry points:
  - `POST /analyze` — single-file scoring, for integration testing and the REST-integration story.
  - `WS /ws/call/{call_id}` — accepts a simulated/browser-mic stream.
  - `WS /ws/twilio` — accepts Twilio Media Streams messages (start/media/stop events), decodes and resamples audio, feeds the same detector pipeline.
- `risk_engine.py` combines detector output with call context into the composite score (see SRS FR-4, FR-5).
- Broadcasts scored events to any dashboard clients subscribed to that `call_id`.

### 2.3 Dashboard (`/dashboard`)
- React app, connects to the server's WebSocket per active call.
- Renders: live waveform, a 0–100 risk gauge, an explainability panel (sub-scores), an alert/recommended-action card, and a call history list.
- No business logic lives here — it only renders what the server sends.

## 3. Data Contract

Every scored event, regardless of source (simulated, browser mic, or Twilio), has the same shape:

```json
{
  "risk_score": 78,
  "band": "high",
  "signals": {
    "spectral_artifact_score": 0.81,
    "prosody_irregularity_score": 0.64,
    "caller_context_score": 0.55,
    "transaction_context_score": 0.40
  },
  "recommendation": "Recommend callback verification before approving transfer"
}
```

Keeping this contract identical across all three audio sources is what lets the dashboard, risk engine, and detector be built and tested independently by different team members without waiting on each other.

## 4. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Model | AASIST-L (PyTorch) | Lightweight (~85K params), fast enough for near real-time CPU inference |
| Backend | FastAPI + WebSockets | Async-native, plays well with streaming audio and live push updates |
| Frontend | React + Tailwind | Fast to theme, wide free dashboard-template availability |
| Live call source (stretch) | Twilio Media Streams | Fastest path to a genuinely live phone call demo |
| Audio tooling | librosa, soundfile, FFmpeg | Resampling and format handling (Twilio sends 8kHz mu-law; model expects 16kHz PCM) |

## 5. Privacy-by-Design Notes

- Raw audio is never written to disk by the server — chunks are processed and discarded in memory.
- Only feature vectors and JSON score events may be logged.
- The lightweight model size supports an on-device/edge deployment story for production, even though the hackathon build runs centrally.

## 6. Deployment View (Demo Environment)

- Backend and detector run locally (`uvicorn server.main:app`).
- Dashboard runs locally (`npm run dev`) and connects to the local backend over `ws://localhost:8000`.
- For a live Twilio demo, the local backend is exposed via a tunnel (e.g. ngrok) so Twilio's public infrastructure can reach it over `wss://`.
