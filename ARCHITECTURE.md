# VoiceTrace Architecture

VoiceTrace is a real-time voice cloning detection system built for the Smart India Hackathon (PSID 260104). It detects AI-generated voice cloning attacks during live phone calls using the AASIST-L deep neural network, multi-signal risk scoring, and liveness verification.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Audio Ingress Paths                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────────┐ │
│  │ Browser  │ │  Twilio  │ │  Asterisk    │ │    REST API        │ │
│  │  WebRTC  │ │  Media   │ │  AudioSocket │ │    /analyze        │ │
│  │/ws/call/ │ │/ws/twilio│ │  TCP:1579    │ │  POST file upload  │ │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ └────────┬───────────┘ │
│       └──────────┬──┴──────────────┘                  │            │
│                  ▼                                     │            │
│  ┌───────────────────────────────┐     ┌──────────────▼──────────┐ │
│  │   StreamingDetector           │     │  Single-file inference  │ │
│  │   (windowed buffer → model)   │     │  (detector.push_full)   │ │
│  └───────────┬───────────────────┘     └──────────────┬──────────┘ │
│              ▼                                        │            │
│  ┌───────────────────────────────┐                    │            │
│  │   BatchInferenceWorker        │                    │            │
│  │   (GPU/CPU batched forward)   │                    │            │
│  │   + ECAPA-TDNN voiceprint     │                    │            │
│  └───────────┬───────────────────┘                    │            │
│              ▼                                        ▼            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    RiskEngine                                │  │
│  │  Composite score = w₁·spoof + w₂·liveness + w₃·context     │  │
│  │                  + w₄·transaction + w₅·voiceprint_mismatch  │  │
│  └────────┬──────────────────────────────────────┬──────────────┘  │
│           ▼                                      ▼                 │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  PubSub Broker  │  │  History DB  │  │  Alert Dispatcher    │  │
│  │  (In-proc/Redis)│  │  (SQLite)    │  │  (Telegram/Webhook)  │  │
│  └────────┬────────┘  └──────────────┘  └──────────────────────┘  │
│           ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  React Dashboard (Vite)  — /ws/score subscriber             │  │
│  │  Live risk gauge · Waveform · Call history · Incidents       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Audio Ingress Paths

VoiceTrace supports four modes of audio ingress:

| Path | Endpoint | Format | Use Case |
|------|----------|--------|----------|
| **Browser WebRTC** | `/ws/call/{call_id}` | Float32 PCM @ 16kHz | In-app 1:1 calls via WebRTC + mic streaming |
| **Twilio Media Streams** | `/ws/twilio` | Base64 μ-law @ 8kHz | Live carrier phone calls |
| **Asterisk AudioSocket** | TCP `:1579` | Raw 16-bit PCM @ 8kHz | Free SIP trunk (Zadarma, Linphone) |
| **REST Upload** | `POST /analyze` | Any audio file | Batch analysis of pre-recorded files |

### 2. Streaming Detector (`detector/streaming.py`)

- Buffers incoming audio into overlapping windows (configurable: default 1s window, 0.5s stride)
- Applies EMA (Exponential Moving Average) smoothing to raw spoof probabilities
- **LivenessChecker**: Real-time heuristics (silence detection, clipping analysis, zero-crossing rate, noise floor variance)
- **Explainable sub-scores**: 5 named signal slices from AASIST-L hidden representation (spectral, prosody, temporal, etc.)

### 3. Batched Inference Worker (`server/batch_worker.py`)

Runs as a background asyncio task with automatic crash recovery and exponential backoff:

- Polls `CallManager` for all active calls (transport-agnostic)
- Collects ready audio windows across all concurrent calls
- Stacks into a single PyTorch tensor for batched GPU/CPU forward pass through AASIST-L
- **Voiceprint matching**: Extracts ECAPA-TDNN speaker embeddings per window, compares via cosine similarity against the first-window baseline to detect mid-call speaker changes
- Scatters results back to respective calls and broadcasts via PubSub

### 4. Risk Engine (`server/risk_engine.py`)

Computes a composite 0–100 risk score:

```
composite = w_spoof    × smoothed_spoof_prob
          + w_liveness × (1 - liveness_score)
          + w_caller   × (1 - caller_familiarity)
          + w_txn      × transaction_risk
          + w_voiceprint × voiceprint_mismatch
```

All weights and thresholds are externalized in `config.yaml` (NFR-5). Risk bands:
- **Low** (0–24): Voice appears genuine
- **Uncertain** (25–34): Borderline — request verification
- **Medium** (35–64): Request additional identity verification
- **High** (65–100): Clone signature detected — recommend callback

### 5. Call Manager (`server/call_manager.py`)

Thread-safe registry mapping `call_id` → `CallState`. Each `CallState` holds:
- `StreamingDetector` instance (ML inference state)
- `CallContext` (caller familiarity, transaction risk, voiceprint similarity)
- Peak risk score, window count, incident flags
- Baseline speaker embedding (ECAPA-TDNN)

Decoupled from WebSocket transport — any ingress path or background worker can access it.

### 6. Connection Manager (`server/connection_manager.py`)

Manages active WebSocket connections separately from business logic:
- Per-call subscriber tracking + global dashboard subscribers
- Enforces `MAX_CALLS` capacity limit
- Dead connection cleanup
- Triggers `finalize_call()` on disconnect (incident reports, history persistence)

### 7. PubSub Broker (`server/pubsub.py`)

Routes scored events across the system:
- **InProcessBroker**: Default for single-worker development
- **RedisBroker**: For multi-worker horizontal scaling (set `REDIS_URL` env var)
- Global channel `_global` broadcasts to all dashboard subscribers via `/ws/score`

### 8. Challenge-Response Verification (`server/challenge.py`)

Anti-replay liveness check:
1. Pre-renders a pool of 100 random 4-digit challenge WAVs at startup (edge-tts or pyttsx3)
2. `ChallengeManager.pick_challenge()` returns a random challenge from the pool
3. Caller's response is transcribed via SpeechBrain ASR (CRDNN)
4. Digit sequence is compared — **fails closed** (returns `False` on any error)

### 9. Model Cache (`server/_model_cache.py`)

Central, lazily-evaluated model registry. Three models loaded at startup:
- **AASIST-L** (`models/weights/AASIST-L.pth`): Core anti-spoofing neural network
- **SpeechBrain ASR** (CRDNN): Challenge-response transcription
- **ECAPA-TDNN** (spkrec-ecapa-voxceleb): Speaker embedding for voiceprint matching

Windows symlink fallback: Uses `snapshot_download(local_dir_use_symlinks=False)` for HuggingFace models.

### 10. Alert Dispatcher (`server/alert_dispatcher.py`)

Fire-and-forget notifications on HIGH-risk detection:
- **Telegram Bot**: Multi-chat ID support via `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`
- **Webhook**: POST JSON to any URL (`ALERT_WEBHOOK_URL`)
- Deduplication: Only one alert per call session (first HIGH window)

### 11. History Database (`server/history_db.py`)

SQLite persistence for call telemetry:
- `log_event()`: Stores every scored window event
- `get_recent_calls()`: Dashboard hydration via `GET /history`
- `save_feedback()`: Operator feedback labels for active-learning loop

### 12. Incident Reports (`server/incident_report.py`)

Generated at call disconnect for any call that reached HIGH risk:
- JSON file with call metadata, evidence window count, peak risk score
- Stored in `models/incidents/` directory
- REST API: `GET /incidents`, `PATCH /incidents/{id}/resolve`

---

## Authentication Flow

### REST Endpoints
- `ApiKeyMiddleware` enforces `X-Api-Key` header on all non-public routes
- Localhost exemption for development (no key required from `127.0.0.1`)
- Rate limiting via `slowapi` (per-IP sliding window)

### WebSocket Endpoints
- **JWT Token Auth**: Client obtains JWT via `POST /api/auth/token` (requires API key)
- Token passed as `?token=` query param or as `{"type": "auth", "token": "..."}` message within 5s
- `/ws/twilio`: No JWT (Twilio doesn't support custom auth frames) — secured via TwiML URL + optional signature validation

### Token Flow
```
Client → POST /api/auth/token (X-Api-Key header) → JWT (60min expiry)
Client → WS /ws/call/{id}?token=<jwt> → Authenticated connection
```

---

## Frontend (React + Vite)

**9 pages** in `dashboard/src/pages/`:
- **Home**: Landing page with feature overview
- **Dashboard**: Live risk gauge, waveform visualization, active call list
- **Call**: WebRTC P2P calling with mic streaming
- **PhoneSetup**: SIP phone configuration (Linphone/MicroSIP)
- **History**: Past call records from SQLite
- **Incidents**: Incident report viewer with resolve action
- **Settings**: Configuration and API key management

**Key hooks** in `dashboard/src/hooks/`:
- `useMicStream.js`: AudioWorklet-based mic capture → WebSocket streaming
- `useWebRTC.js`: WebRTC peer connection with signaling relay
- `useWebSocket.js`: Dashboard score subscription
- `useSession.js`: JWT token management

---

## Privacy & Compliance (DPDP Act 2023)

- **No raw audio persistence**: `RETAIN_AUDIO=false` enforced via runtime assertion
- **Data minimization**: Only risk scores and metadata are persisted; biometric audio is ephemeral
- **Feature retention opt-in**: `RETAIN_FEATURES` requires explicit consent for research use
- **Log privacy**: `LOG_RAW_AUDIO=false` by default; only scores and call metadata logged

---

## Deployment

### Local Development
```bash
# Backend
pip install -r requirements.txt
uvicorn server.main:app --reload

# Frontend
cd dashboard && npm install && npm run dev
```

### Docker Compose
```bash
docker-compose up -d  # Backend + Dashboard + Asterisk
```

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `VOICETRACE_API_KEY` | Yes | 32+ byte secret for API authentication |
| `VOICETRACE_JWT_SECRET` | No | JWT signing key (defaults to API key) |
| `REDIS_URL` | No | Redis URL for multi-worker pub/sub |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID(s) for alerts |
| `ALERT_WEBHOOK_URL` | No | Webhook URL for alert delivery |
| `TWILIO_AUTH_TOKEN` | No | Twilio signature validation |
| `TURN_SHARED_SECRET` | No | TURN server credential generation |
