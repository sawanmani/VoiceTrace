# VoiceTrace — System Architecture

> SIH 2026 | PSID 260104

## Data Flow

```
SIP Softphone ──► Asterisk PBX ──► AudioSocket TCP ──► VoiceTrace Server
(Linphone)        (WSL2:5060)      (localhost:1579)     (localhost:8000)
                                                              │
                                                    ┌─────────┴──────────┐
                                                    │                    │
                                              StreamingDetector    call_manager
                                              (deque buffer)       (thread-safe)
                                                    │
                                              BatchWorker
                                              (polls 100ms)
                                                    │
                                         ┌──────────┴──────────┐
                                         │                     │
                                    AASIST-L Model      LivenessChecker
                                    (426KB, ~25ms)      (heuristics)
                                         │                     │
                                         └──────────┬──────────┘
                                                    │
                                              RiskEngine
                                           (composite 0-100)
                                                    │
                                    ┌───────────────┼───────────────┐
                                    │               │               │
                              Dashboard WS    Telegram Bot    Incident Reports
                              (:5173)         (free)          (JSON files)
```

## Alternative Input Paths

| Path | Protocol | When |
|------|----------|------|
| Asterisk AudioSocket | TCP binary | SIH demo (free) |
| Twilio Media Streams | WebSocket JSON | Cloud fallback |
| WebRTC Browser | WebSocket binary | In-app calls |
| File Upload | HTTP POST | Testing/offline |

## Cost: ₹0

All components are open-source and free.
