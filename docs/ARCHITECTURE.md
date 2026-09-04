# System Architecture

**Project:** VoiceTrace | **Developed by:** Team VoiceTracers | **Reference:** SIH 2026, PSID 260104

---

## 1. High-Level Data Flow

### 1a. Existing mic/Twilio path

```
Audio source                 Detection layer              Scoring & delivery         UI
─────────────               ─────────────────             ──────────────────        ──────────
Mic / WebRTC   ─┐                                                                    Live gauge
Simulated file ─┼──► Chunker ──► StreamingDetector ──► BatchWorker ──► RiskEngine ──► WebSocket ──► Waveform
Twilio call    ─┘    (1s       (buffers windows)    (dynamic   (model +        broadcast      Explain panel
                      windows)                       batching)  context)       (requires auth)
```

### 1b. WebRTC in-app calling path (Phase 1 build — this document)

```
[User A Browser]  ──── WebRTC (video+audio, P2P via STUN) ────  [User B Browser]
       │                                                                 │
       │  getUserMedia audio                             getUserMedia audio
       │       │                                                  │
       │   ScriptProcessor                              ScriptProcessor
       │   (float32 PCM)                                (float32 PCM)
       │       │                                                  │
       └── WS /ws/call/{roomId}-local ──────────────────────────┘
                          │                    │
               server/ FastAPI WebSocket endpoint
                          │
              detector/ StreamingDetector (rolling 1s windows)
                          │
                    BatchWorker (dynamic batching, async thread pool)
                          │
                    RiskEngine → {risk_score 0–100, band, signals, recommendation}
                          │
                    JSON pushed back to SAME WS client connection
                          │
              CloneWarningOverlay renders on top of call UI
              (red/yellow/green band + explainability note)
```

**Critical design constraint:** The WebRTC media path (P2P call audio) and the detection
path (binary WS frames to server) are physically separate connections. Detection latency
(~15–40ms inference + ~500ms window accumulation) **never delays the call itself**. It is
a side-channel analysis only.

---

## 2. Components

### 2.1 Detector (`/detector`)

**Model:** AASIST-L (Audio Anti-Spoofing using Integrated Spectro-Temporal graph attention
network, Large variant). Original paper: Jung et al., "AASIST: Audio Anti-Spoofing using
Integrated Spectro-Temporal Graph Attention Networks", ICASSP 2022.

- ~85K parameters. Fast enough for near real-time CPU inference.
- Input: 64,600 samples (~4 seconds) at 16 kHz mono — padded/trimmed to fixed length.
- Output: 2-class softmax (genuine / spoof). We take `probs[1]` as `spoof_prob`.
- Checkpoint source: original AASIST repo (LA condition, ASVspoof 2019).

**Reported accuracy (ASVspoof 2019 LA eval set, full utterances):**
- EER: ~0.83% (paper result, full utterances, clean conditions)
- t-DCF: ~0.028

**Our demo accuracy note:**
- We operate on 1-second rolling windows, not full utterances. Shorter context degrades EER.
- Observed on our held-out test clips (5 genuine + 5 ASVspoof 2019 LA spoof):
  - Full-file scoring (`POST /analyze`): all 10 correctly classified (EER estimated < 10%)
  - Rolling 1s window: 4/5 spoof clips triggered `band=high` within 3 windows; 5/5 genuine
    clips stayed `band=low`. This is a small-scale sanity check, not a benchmark.

`StreamingDetector` buffers incoming PCM into overlapping windows (window_sec=1.0,
stride_sec=0.5, 50% overlap) and returns a smoothed `spoof_prob` per window via EMA
(α=0.35). A `LivenessChecker` runs heuristic pre-checks (silence, clipping, ZCR, noise floor)
before the neural model, allowing fast rejection of dead/silence windows.

Sub-feature scores are extracted from AASIST-L's last hidden representation (160-dim) by
splitting into 5 named 32-dim buckets (spectral_artifact, prosody_irregularity, gan_artifact,
f0_trajectory, phase_coherence) and computing mean L2 norm, soft-clamped via tanh. These
are **proxy explainability scores** — they reflect activation magnitude in each representation
region, not independently trained probes.

### 2.2 Server (`/server`)

FastAPI application, entry points:
- `POST /analyze` — single-file scoring, for integration testing.
- `WS /ws/call/{call_id}` — accepts a browser mic or WebRTC side-channel stream.
  Requires WebSocket auth payload `{"type":"auth","api_key":"..."}` on first frame.
- `WS /ws/signal/{room_id}` — **WebRTC signaling relay** (new in Phase 1).
  Dumb relay: forwards offer/answer/ICE-candidate JSON frames between two peers.
  No API key required (carries only opaque SDP/ICE, no audio or PII).
- `WS /ws/score` — global dashboard subscriber (push all call events).
- `WS /ws/twilio` — Twilio Media Streams adapter (roadmap).
- `GET /rooms/{room_id}/exists` — REST check for room existence.

`batch_worker.py` (Dynamic Batching): Background task polling every 100ms. Batches ready
audio windows from all active calls, executes PyTorch inference in a thread pool executor
(non-blocking for the event loop), and broadcasts `RiskEvent` JSON back to clients.

`signaling.py` (new): `SignalingRoom` and `SignalingManager` handle room lifecycle.
Rooms hold exactly 2 peers. When the second peer joins, both receive `{"type":"ready","role":"caller"|"callee"}`.
The "caller" role sends the SDP offer; the "callee" answers. ICE candidates are relayed symmetrically.

### 2.3 Dashboard (`/dashboard`)

React app, connects to the server's WebSocket per active call.

**New: `/call` page** — full-screen WebRTC call UI with:
- `useWebRTC.js` hook: encapsulates `RTCPeerConnection`, signaling WS, and detection side-channel.
- `CloneWarningOverlay.jsx`: Truecaller-style overlay banner rendering on top of the remote
  video tile. Three states: green (< 35), yellow (35–64), red (≥ 65). The top-scoring
  AASIST-L sub-feature is shown as an explainability note (e.g. "Spectral artifacts
  detected — possible AI synthesis"). Red is non-dismissible and re-appears on re-escalation.

---

## 3. Data Contract

Every scored event, regardless of source, has the same shape:

```json
{
  "risk_score": 78,
  "band": "high",
  "signals": {
    "spectral_artifact_score": 0.81,
    "prosody_irregularity_score": 0.64,
    "gan_artifact_score": 0.72,
    "f0_trajectory_score": 0.58,
    "phase_coherence_score": 0.43,
    "liveness_score": 0.12,
    "caller_context_score": 0.55,
    "transaction_context_score": 0.40
  },
  "recommendation": "HIGH RISK: Clone signature detected. Recommend callback on a known number.",
  "call_id": "ABC123-local",
  "window_index": 7,
  "latency_ms": 23.4,
  "timestamp": 1724980800.123
}
```

---

## 4. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Model | AASIST-L (PyTorch) | Lightweight (~85K params), fast enough for near real-time CPU inference |
| Backend | FastAPI + WebSockets | Async-native, plays well with streaming audio and live push updates |
| Frontend | React + Tailwind | Fast to theme, wide free dashboard-template availability |
| WebRTC | Native `RTCPeerConnection` API | No extra library, widely supported, avoids unmaintained deps (simple-peer) |
| STUN | `stun:stun.l.google.com:19302` | Free public, no API key, reliable for same-LAN and home network demos |
| Audio tooling | librosa, soundfile, FFmpeg | Resampling and format handling |
| Live call source (roadmap) | Carrier SIP/VoIP gateway | Production deployment: intercept at the gateway, not the device |

---

## 5. Known Technical Risks & Mitigations

### 5.1 Latency vs. Accuracy Trade-off

**Risk:** Live audio through a deep model is computationally expensive. With 1s windows and
50% overlap, the detection pipeline produces a score every 500ms at best. On CPU (no GPU),
AASIST-L inference takes ~15–40ms per window. The effective end-to-end detection lag is
~1–1.5 seconds (window accumulation + inference + WS round-trip).

**Why this is acceptable for the demo:** The PS specifies "near-real-time" detection, not
inline audio processing. The call audio is unaffected — detection is a side-channel. A
1.5s lag to flag a clone is meaningfully faster than a human noticing the anomaly in
conversation.

**Mitigation:** EMA smoothing (α=0.35) prevents single-window false positives from
triggering the overlay. The overlay only locks to red after sustained high spoof_prob.

**Documented actual latency achieved:**
- CPU (i5 12th gen): ~22–35ms per 1s window
- Full detection cycle (accumulation + inference + WS push): ~600–800ms

### 5.2 Noisy / Compressed Audio (False Negatives & Positives)

**Risk:** Real VoIP/mobile audio has codec compression (Opus at 16–32 kbps, G.711 µ-law at
64 kbps) and packet loss that can mask synthesis artifacts (increasing false negatives) or
make genuine audio sound synthetic (increasing false positives).

**Our WebRTC path partially mitigates this:** WebRTC in-browser audio is captured *before*
WebRTC's own codec layer — we tap the raw PCM via Web Audio API before it hits the Opus
encoder. The detected audio is therefore uncompressed on the local side. The remote peer's
audio, if we were to detect it, would be decoded Opus — which introduces artifacts.

**Current scope:** We detect the *local user's* audio side-channel only. Detection of the
remote peer's audio would require the remote peer to also open a detection WS connection.
This is by design for the demo — both participants run the dashboard.

**Detection direction (important for evaluators):** Each browser's overlay reflects the
risk score for **that browser's own microphone input**. In the attack scenario, the
"attacker" browser plays the cloned sample into its own mic; the attacker's own overlay
turns red, and — because both participants post to the same shared risk stream — the
victim's dashboard also receives and displays the same high-risk event. This means the
victim sees the warning even though the *victim's* mic is clean, because the risk event
is keyed to the `call_id` / `room_id`, not to a per-participant stream.

**Test coverage:** We tested against one Opus-compressed sample (recorded and re-encoded at
24kbps). The spoof classifier still flagged it as high-risk, suggesting the synthesis
artifacts survive lossy compression in this case. This is not a general result.

### 5.3 Adversarial Adaptation

**Risk:** Detection models face an arms race against improving voice generators. An attacker
who knows the detection model's architecture can craft audio that evades classification
(adaptive adversary). EER on clean test sets does not bound real-world performance against
adaptive attacks.

**Our position:** The risk scoring system is explicitly probabilistic and threshold-based,
not a hard binary classifier. The output is a 0–100 risk score with confidence bands —
designed to inform human decision-making, not to act as an autonomous gate. A single
score never triggers an automated block; it triggers a recommendation to the human on the
call (e.g. "verify via callback"). This framing is deliberately conservative and honest.
The model will need periodic retraining as generator quality improves. A static checkpoint
is a point-in-time defense.

---

## 6. Privacy & Data Minimization (DPDP Act 2023 Alignment)

Under India's **Digital Personal Data Protection Act 2023** (DPDP Act), voice audio
constitutes personal data, and under certain interpretations, biometric data. Section 4(1)(b)
mandates collection of only data necessary for the specified processing purpose.

Our implementation enforces data minimization at the architecture level:

| Principle | Implementation |
|---|---|
| **No raw audio persistence** | `config.yaml: privacy.retain_audio: false`. The batch worker asserts this flag at startup (hard failure if misconfigured). Audio chunks are processed in RAM and discarded after the inference window. |
| **No feature embedding persistence** | `config.yaml: privacy.retain_features: false`. Extracted AASIST-L hidden representations are computed, used to derive scores, and immediately freed. |
| **Score-only persistence** | `history_db.py` stores only `{call_id, timestamp, risk_score, band, window_index}` — no waveforms, no spectrograms. |
| **Consent for any biometric feature** | Any future "voice print comparison" feature (Layer 3, cross-session identity matching) is off by default and would require explicit informed consent before enabling. See `risk_engine.py: CallContext.caller_identity_match_score`. |
| **Transparency** | The overlay always shows the explainability reason, not just a score. Users know *why* a warning fired. |

This mapping does not constitute legal advice. It documents our design intent for SIH evaluation purposes.

---

## 7. Deployment View (Demo Environment)

- Backend runs locally: `uvicorn server.main:app --reload` (from project root `c:\voicetrace`)
- Frontend runs locally: `cd dashboard && npm run dev`
- Two browser tabs/windows connect to `http://localhost:5173/call?room=<ROOMID>`
- Signaling: `ws://localhost:8000/ws/signal/<ROOMID>`
- Detection: `ws://localhost:8000/ws/call/<ROOMID>-local`

For a multi-device demo on the same LAN: expose the backend on `0.0.0.0:8000` and update
`dashboard/.env: VITE_API_URL=http://<host-ip>:8000`.

For remote demos: use [ngrok](https://ngrok.com) to tunnel port 8000 and update the `.env`.
Note: WebRTC over NAT between different networks may require a TURN server for reliability.
For the demo, same-network or same-machine (two browser tabs) is the safest configuration.

## 8. Production Roadmap (Out of Scope for This Build)

- **Carrier/SIP gateway integration:** Production deployment sits at the enterprise SIP-VoIP
  gateway or telco IMS layer, where call audio is accessible at the carrier level without
  device-side restrictions. This bypasses the Android 10+ `VOICE_CALL` audio source block.
- **gRPC streaming API:** For low-latency bulk audio ingestion from gateway partners.
- **TURN server:** Required for reliable WebRTC over symmetric NATs and corporate firewalls.
- **Model retraining pipeline:** Periodic fine-tuning on newly collected spoof samples to
  maintain effectiveness against improving generators.
- **Multi-party call support:** Current signaling supports 1:1 (max 2 peers per room).
