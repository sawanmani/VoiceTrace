# Software Requirements Specification (SRS)

**Project:** VoiceTrace — Real-Time Voice Cloning Detection
**Developed by:** Team VoiceTracers
**Reference:** SIH 2026, PSID 260104
**Version:** 0.1 (Draft, pre-development)

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for a system that detects AI-generated or cloned voices in near real time during a live call, and warns a user before a sensitive action is taken based on that call.

### 1.2 Scope
The system will:
- Accept a live or streamed audio input (simulated call, WebRTC call, or Twilio-forwarded live call).
- Analyze the audio in rolling windows and produce a spoof-probability score per window.
- Combine that score with call context (caller familiarity, transaction context) into a single explainable risk score.
- Display the score and its contributing signals live on a dashboard.
- Trigger an alert and a recommended action once risk crosses a configurable threshold.

Out of scope for the hackathon build: production-grade carrier integration, persistent voiceprint enrollment across an organization, and legal/compliance certification.

### 1.3 Definitions and Abbreviations
- **Spoof / Clone:** AI-synthesized or manipulated speech impersonating a real person.
- **Risk Score:** 0–100 composite score representing impersonation likelihood.
- **Window:** A fixed-length (1–3 second) segment of audio scored independently.

### 1.4 References
- ASVspoof 2021 Challenge documentation (asvspoof.org)
- AASIST / AASIST-L model paper and official repository (clovaai/aasist)
- Twilio Media Streams documentation

---

## 2. Overall Description

### 2.1 Product Perspective
VoiceTrace is a standalone system with three components (detector, server, dashboard) that can also expose a REST/WebSocket API for integration into a bank, enterprise, or telecom's existing call-handling systems.

### 2.2 Product Functions
- Real-time audio ingestion and chunking
- Spoof/clone detection via a pretrained deep learning model
- Context-aware risk scoring with an explainable breakdown
- Live dashboard visualization
- Threshold-based alerting with recommended actions
- Minimal-retention, privacy-respecting audio handling

### 2.3 User Classes
| User class | Needs |
|---|---|
| Frontline bank/call-center staff | Simple, fast visual warning during a live call |
| Security/fraud analyst | Explainable sub-scores, call history, tunable thresholds |
| Integrating developer | Clean REST/WebSocket API, predictable JSON schema |
| SIH evaluator | Working live demo, clear reasoning, visible accuracy |

### 2.4 Operating Environment
- Backend: Python 3.9–3.10, FastAPI, runs on CPU (GPU optional)
- Frontend: Node.js 18+, React
- Audio source: microphone/WebRTC (demo) or Twilio Media Streams (live call demo)

### 2.5 Constraints
- Must run without a live production telecom integration (hackathon timeframe).
- Must not persist raw audio beyond the scoring window.
- Must degrade gracefully if network/live-call integration is unavailable (fallback to simulated stream).

---

## 3. Specific Requirements

### 3.1 Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | The system shall accept a continuous audio stream in fixed-length overlapping windows. |
| FR-2 | The system shall classify each window as genuine or spoofed with a confidence score. |
| FR-3 | The system shall smooth per-window scores to avoid single-frame false spikes. |
| FR-4 | The system shall combine model confidence with caller and transaction context into one composite risk score. |
| FR-5 | The system shall return sub-scores (spectral, prosody, context) alongside the composite score, not just a single number. |
| FR-6 | The system shall push live score updates to a connected dashboard over WebSocket. |
| FR-7 | The system shall trigger a visible alert and a recommended action when risk crosses a configurable threshold. |
| FR-8 | The system shall expose a REST endpoint accepting a single audio file and returning the same scored JSON shape. |
| FR-9 | The system shall support at least one non-English/Indian-accent language sample. |

### 3.2 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 (Performance) | A risk score shall be available within 2–3 seconds of stream start. |
| NFR-2 (Privacy) | Raw audio shall not be written to persistent storage; only feature vectors and scores may be logged. |
| NFR-3 (Explainability) | Every risk score returned shall include its contributing sub-scores. |
| NFR-4 (Portability) | The detector shall run on CPU without requiring a GPU. |
| NFR-5 (Configurability) | Risk-scoring weights and alert thresholds shall be adjustable via a config file, not hardcoded. |
| NFR-6 (Resilience) | If live-call audio is unavailable, the system shall fall back to a simulated stream without crashing the demo. |

### 3.3 External Interface Requirements
- `POST /analyze` — accepts an audio file, returns a scored JSON response.
- `WS /ws/call/{call_id}` — accepts streamed audio chunks, emits live scored events.
- `WS /ws/twilio` — Twilio Media Streams-compatible endpoint for real live-call audio.

---

## 4. System Features (by module)

1. **Detection module** — pretrained spoof-detection model, streaming wrapper.
2. **Risk engine module** — scoring formula, threshold logic, explainability output.
3. **API/server module** — FastAPI app, WebSocket bridges (simulated + Twilio), REST endpoint.
4. **Dashboard module** — live gauge, waveform, explainability panel, alert card, call history.

---

## 5. Appendix

This SRS is a living document. Update it as scope changes during development — in particular, revisit Section 3.1 if a live telephony integration (Twilio) moves from "stretch goal" to "committed demo feature."
