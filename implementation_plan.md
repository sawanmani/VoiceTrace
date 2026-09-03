# Honest Audit: Is This Plan 100% Working & Free?

> **Short answer: It's NOT 100% working yet, and "free" depends on what you mean. Read below for the full truth.**

---

## Part 1: Cost Audit — Is It Really ₹0?

### ✅ Things That Are Genuinely FREE (₹0)

| Component | Cost | License | Notes |
|-----------|------|---------|-------|
| **Asterisk PBX** | ₹0 | GPLv2 Open Source | Always free, forever |
| **Python / FastAPI / PyTorch** | ₹0 | Open Source | Already in your stack |
| **AASIST-L Model** | ₹0 | Research license | Open checkpoint from ASVspoof |
| **Linphone / MicroSIP** (SIP softphone) | ₹0 | Open Source | For making test calls |
| **Telegram Bot API** | ₹0 | Free tier | Unlimited messages for bots |
| **WSL2 Ubuntu** | ₹0 | Free with Windows | Better than Docker for this |
| **pyttsx3** (TTS for test samples) | ₹0 | MIT License | Generate clone samples |

### ❌ Things That Cost Money (NO Workaround)

| Component | Cost | Why You Need It | Free Alternative |
|-----------|------|----------------|------------------|
| **Real Indian DID Number** (+91-XXXX) | ₹1500-2000/mo (Exotel/KnowLarity) | So random people can call from real phones | ❌ **None.** Indian DID numbers require TRAI compliance + KYC. No free option exists. |
| **Twilio Phone Number** | ~$1.15/mo (~₹95) + per-min charges | Same — real phone number | ❌ None |
| **Cloud VPS** (if not using local machine) | ₹300-500/mo (DigitalOcean/AWS) | If you need a public IP for SIP | ✅ **Use your own laptop** — free |

### 🟢 The 100% Free Path (What You Should Do)

> [!IMPORTANT]
> **You do NOT need a real phone number for SIH demo.** Here's why:
>
> A SIP softphone (Linphone/MicroSIP) on your laptop makes a **real SIP call** to Asterisk running on the same machine. The audio path is **identical** to a real PSTN call — same codec (G.711 µ-law), same protocol (SIP/RTP), same 8kHz audio quality. The only difference is the call doesn't travel over the telephone network — it stays on localhost.
>
> **For SIH judges, this is perfectly valid.** You're demonstrating the technology stack, not a telecom deployment.

**100% Free Demo Flow:**
```
Linphone (free SIP softphone on your laptop)
    │
    │ SIP call over localhost (port 5060)
    │ Same G.711 µ-law codec as real PSTN
    │
    ▼
Asterisk (running in WSL2, free)
    │
    │ AudioSocket (TCP, localhost:1579)
    │ Raw 8kHz 16-bit PCM
    │
    ▼
VoiceTrace FastAPI (your existing code)
    │
    │ StreamingDetector → BatchWorker → RiskEngine
    │
    ▼
Dashboard (localhost:5173) — shows real-time clone detection
    │
    ▼ (if band=high)
Telegram Bot Alert (free)
```

**Total cost: ₹0.**

---

## Part 2: Is It 100% Working?

### Honest Answer: NO. Nothing is "100% working" before you build and test it.

Here's what IS proven vs what NEEDS to be built:

### ✅ PROVEN (Already Working in Your Codebase — 70%)

| Component | Status | Evidence |
|-----------|--------|----------|
| `StreamingDetector` — buffers PCM, creates 1s windows | ✅ Working | Used by WebRTC + Twilio paths today |
| `BatchWorker` — batched AASIST-L inference | ✅ Working | Running in production |
| `RiskEngine` — composite scoring 0-100 | ✅ Working | Battle-tested |
| `call_manager` — thread-safe call registry | ✅ Working | Handles concurrent calls |
| `_resample(8000, 16000)` — 8kHz→16kHz polyphase resampling | ✅ Working | Used by `decode_twilio_chunk()` right now |
| `_lufs_normalize()` — loudness normalization | ✅ Working | Same |
| Dashboard WebSocket broadcast | ✅ Working | Shows real-time scores |
| AASIST-L model inference | ✅ Working | ~25ms per window on CPU |

### 🟡 NEW CODE NEEDED (30% — Must Be Written & Tested)

| Component | Complexity | Risk | Similar To |
|-----------|-----------|------|------------|
| `audiosocket_server.py` — TCP server | Medium | 🟡 | Very similar to `ws_twilio()` handler, but TCP instead of WebSocket |
| `decode_asterisk_chunk()` — PCM decoder | Easy | 🟢 | Simpler than `decode_twilio_chunk()` — no µ-law decode needed, just int16→float32 |
| Asterisk `pjsip.conf` — SIP config | Easy | 🟢 | Standard config, well-documented |
| Asterisk `extensions.conf` — dialplan | Easy | 🟢 | 5 lines of dialplan |
| `alert_dispatcher.py` — Telegram alerts | Easy | 🟢 | Simple HTTP POST |
| Integration wiring (lifespan hook) | Easy | 🟢 | 2 lines of code |

### 🔴 CRITICAL BUG IN THE ORIGINAL PLAN

> [!CAUTION]
> **`--network=host` does NOT work on Docker Desktop for Windows.**
>
> The plan recommended running Asterisk in Docker with `--network=host`. I've now verified: **this is broken on Windows.** Docker Desktop on Windows runs containers inside a WSL2 utility VM. `--network=host` maps to that VM's network, NOT your Windows host.
>
> **What breaks:**
> - Asterisk in Docker can't reach VoiceTrace on `localhost:1579` (different network namespace)
> - SIP softphone on Windows can't reach Asterisk on `localhost:5060`
> - Everything fails silently — no errors, just no connection
>
> **Fix:** Don't use Docker for Asterisk. Install Asterisk **directly in WSL2 Ubuntu** instead:
> ```bash
> # In WSL2 Ubuntu terminal:
> sudo apt update
> sudo apt install asterisk -y
> sudo asterisk -cvvvvv  # Start in foreground with verbose logging
> ```
> This runs Asterisk natively in the Linux environment. WSL2's network is bridged to Windows, so `localhost` works in both directions.

---

## Part 3: Revised Plan (Truly Free, Windows-Compatible)

### What Changed From Original Plan

| Item | Original Plan | Revised (Free + Working) |
|------|--------------|--------------------------|
| **Asterisk deployment** | Docker with `--network=host` | **WSL2 native install** (`sudo apt install asterisk`) |
| **SIP trunk** | Exotel/Twilio (₹₹₹) | **Local SIP softphone** (Linphone, ₹0) |
| **Phone number** | Indian DID (+91) needed | **No phone number needed** — softphone calls directly |
| **Alert delivery** | Telegram + WhatsApp + FCM + webhook | **Telegram only** (free, simplest) |
| **ARI Stasis app** | Separate Python process | **Not needed** for Demo Mode |
| **docker-compose.yml** | Required | **Not needed** — Asterisk runs in WSL2 directly |

### Revised Architecture (100% Free)

```
┌──────────────────────────────────────────────────────────────┐
│  Your Windows Laptop (SIH Demo Machine)                      │
│                                                               │
│  ┌─────────────────────┐     ┌──────────────────────────┐    │
│  │ Windows Side         │     │ WSL2 Ubuntu Side         │    │
│  │                      │     │                           │    │
│  │  Linphone (softphone)│────►│  Asterisk (apt install)  │    │
│  │  localhost:5060 SIP   │     │  Port 5060 (SIP)         │    │
│  │                      │     │       │                   │    │
│  │  VoiceTrace Server   │◄────│       │ AudioSocket TCP  │    │
│  │  localhost:8000       │     │       │ localhost:1579    │    │
│  │  localhost:1579 (TCP) │     │       │                   │    │
│  │                      │     │       ▼                   │    │
│  │  Dashboard           │     │  extensions.conf:        │    │
│  │  localhost:5173       │     │  AudioSocket(UUID,:1579) │    │
│  └─────────────────────┘     └──────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

> [!TIP]
> **WSL2 and Windows share `localhost`** — a service running on port 1579 in Windows is accessible as `localhost:1579` from WSL2 and vice versa. No port forwarding needed.

### Revised File Count

| Phase | Files | Type |
|-------|-------|------|
| Phase 1 | 4 Asterisk config files | `pjsip.conf`, `extensions.conf`, `rtp.conf`, `modules.conf` |
| Phase 2 | 1 new Python file + 2 small edits | `audiosocket_server.py` + edits to `audio_utils.py` and `main.py` |
| Phase 3 | 0 | Just verification — connect softphone and test |
| Phase 4 | 1 new Python file | `alert_dispatcher.py` |
| Phase 5 | 1 test file | `test_audiosocket_client.py` |
| **Total** | **7 new files + 2 edits** | Down from 18 |

---

## Part 4: Confidence Level

| Question | Answer |
|----------|--------|
| Will Asterisk install on WSL2? | **99%** — `sudo apt install asterisk` is extremely well-tested |
| Will AudioSocket module be available? | **95%** — Ubuntu's Asterisk package includes it. Verify with `module show` |
| Will the TCP server work? | **90%** — It's standard `asyncio` TCP. The protocol is simple (3-byte header). Main risk: TCP framing bugs, mitigated by `readexactly()` |
| Will audio quality match? | **95%** — AudioSocket sends linear PCM (better than Twilio's µ-law). Same resampling function already tested |
| Will dashboard show scores? | **95%** — Same `call_manager` + `BatchWorker` pipeline, just different input source |
| Will it cost ₹0? | **100%** — If you use local softphone + WSL2 Asterisk + Telegram bot |
| Is it "100% working" right now? | **NO** — The AudioSocket server code needs to be written and tested. ~4-6 hours of coding work |

### What Could Go Wrong (Real Risks, Not Theoretical)

| Risk | Probability | Impact | Can You Recover? |
|------|-------------|--------|-----------------|
| WSL2 Asterisk can't bind port 5060 | 10% | Blocks Phase 1 | Yes — change port in `pjsip.conf` to 5061 |
| AudioSocket module not in Ubuntu's Asterisk package | 5% | Blocks Phase 3 | Yes — compile from source, or use EAGI as fallback |
| TCP framing bug corrupts audio | 20% | Garbled scores | Yes — use `readexactly()` and add byte-level debugging |
| `connect_call()` expects WebSocket, not TCP | 100% (known) | Won't compile | Already solved — use `call_manager.add_call()` directly |
| Linphone can't register to WSL2 Asterisk | 15% | Can't make test calls | Use `localhost` or WSL2's IP address; check firewall |
| Existing tests break | 5% | CI fails | Shouldn't — all changes are additive |

---

## Part 5: My Honest Recommendation

> [!IMPORTANT]
> **For SIH 2026 PSID 260104, this is what I'd do:**
>
> 1. **Keep Twilio code as-is** — it's your safety net
> 2. **Build the Asterisk path (Track A Demo Mode)** — ~6-8 hours of work
> 3. **Use WSL2 + Linphone** — ₹0 cost, works on your laptop
> 4. **On demo day:** Show judges both paths:
>    - "Here's our self-hosted Asterisk path (no vendor lock-in, free, Indian PSTN ready)"
>    - "And here's our Twilio fallback (cloud-based, for comparison)"
>    - Judges will be MORE impressed that you have TWO telephony backends
>
> 5. **If you later want a real phone number** (post-SIH, production):
>    - Exotel vSIP (₹2000/mo) for Indian DID
>    - Or Twilio Elastic SIP Trunk (~₹95/mo + per-min)
>    - Same Asterisk config, just change the SIP trunk in `pjsip.conf`

### Bottom Line

| Question | Honest Answer |
|----------|---------------|
| Can I build this for ₹0? | **Yes** — with local softphone + WSL2 Asterisk |
| Is the plan 100% working today? | **No** — 70% is proven code, 30% needs to be written |
| Will it work after building? | **Very likely (90%+)** — the new code is simple and modeled on existing working code |
| Is Asterisk better than Twilio for SIH? | **Yes** — self-hosted, free, more control, more impressive to judges |
| Should I delete Twilio code? | **No** — keep it as fallback, show both to judges |
