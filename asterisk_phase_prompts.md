# VoiceTrace — Asterisk Integration: Phase-Wise Prompts & Commands

> **SIH 2026 | PSID 260104 | Team VoiceTracers**
> 
> Copy-paste ready commands for each phase. Follow in order.

---

## Table of Contents

1. [Phase 1 — Asterisk Server Deployment](#phase-1--asterisk-server-deployment)
2. [Phase 2 — AudioSocket TCP Server](#phase-2--audiosocket-tcp-server)
3. [Phase 3 — Dialplan Wiring](#phase-3--dialplan-wiring)
4. [Phase 4 — Alert Delivery](#phase-4--alert-delivery)
5. [Phase 5 — Testing & Validation](#phase-5--testing--validation)
6. [Risk Summary Table](#risk-summary-table)
7. [SIH Demo Day Runbook](#sih-demo-day-runbook)

---

## Phase 1 — Asterisk Server Deployment

### Goal
Get Asterisk running in Docker so it can accept SIP calls and route audio.

### Prerequisites
```powershell
# Verify Docker is installed
docker --version
# Expected: Docker version 24.x or higher

docker-compose --version
# Expected: Docker Compose version v2.x
```

### Step 1.1 — Create Directory Structure
```powershell
# From project root
mkdir -p deploy/asterisk/configs
mkdir -p deploy/asterisk/audio
```

### Step 1.2 — Create Docker Compose File
**Prompt:** "Create `deploy/asterisk/docker-compose.yml` with Asterisk 20 LTS, host networking, volume mounting configs from `./configs:/etc/asterisk`, and audio from `./audio:/var/lib/asterisk/sounds/custom`."

**Key settings:**
- Image: `andrius/asterisk:20-current`
- Network: `host` (critical for SIP/RTP)
- Restart: `unless-stopped`
- Volumes: configs + custom audio

### Step 1.3 — Create PJSIP Config
**Prompt:** "Create `deploy/asterisk/configs/pjsip.conf` for Asterisk 20 with:
- UDP transport on port 5060
- A local softphone endpoint for testing (username: `test`, password: `test1234`)
- Template for Exotel/Twilio SIP trunk (commented out)
- Codec: disallow all, allow ulaw and alaw only"

### Step 1.4 — Create Extensions (Dialplan)
**Prompt:** "Create `deploy/asterisk/configs/extensions.conf` with:
- `[from-external]` context: Answer, play welcome, then AudioSocket to 127.0.0.1:1579
- `[softphone]` context: extension 100 for local testing
- Use `${UNIQUEID}` as the UUID for AudioSocket"

### Step 1.5 — Create Supporting Configs
**Prompt:** "Create these Asterisk config files:
- `deploy/asterisk/configs/modules.conf`: Load `res_audiosocket` and `app_audiosocket`
- `deploy/asterisk/configs/rtp.conf`: Port range 10000-20000
- `deploy/asterisk/configs/logger.conf`: Console + file logging"

### Step 1.6 — Boot Asterisk
```powershell
cd deploy/asterisk
docker-compose up -d
```

### Step 1.7 — Verify
```powershell
# Check container is running
docker ps --filter name=asterisk

# Enter Asterisk CLI
docker exec -it voicetrace-asterisk asterisk -rvvv

# Inside Asterisk CLI:
module show like audiosocket
# Expected output:
# res_audiosocket.so    Asterisk AudioSocket Support    0    Running
# app_audiosocket.so    AudioSocket Application         0    Running

pjsip show endpoints
# Should show your test endpoint

dialplan show from-external
# Should show your dialplan

exit
```

### ⚠️ Phase 1 Risks

| # | Risk | What Happens | How to Fix |
|---|------|-------------|------------|
| 1 | Docker not running | Container won't start | Start Docker Desktop, wait 30s, retry |
| 2 | Port 5060 already in use | Asterisk can't bind SIP port | `netstat -an | findstr 5060` — kill the process |
| 3 | AudioSocket module missing | `module show` returns nothing | Wrong Docker image. Use `andrius/asterisk:20-current` |
| 4 | Config syntax error | Asterisk exits on startup | Check `docker logs voicetrace-asterisk` for exact error line |

### ✅ Phase 1 Done When
- [  ] `docker ps` shows Asterisk container running
- [  ] `module show like audiosocket` shows 2 modules loaded
- [  ] `dialplan show from-external` shows your AudioSocket routing

---

## Phase 2 — AudioSocket TCP Server

### Goal
Create a Python TCP server in VoiceTrace that receives raw PCM audio from Asterisk's AudioSocket protocol.

### Step 2.1 — Create AudioSocket Server
**Prompt:** "Create `server/audiosocket_server.py` — an asyncio TCP server that:
1. Listens on port from `config.yaml` (default 1579)
2. Parses AudioSocket binary protocol: 3-byte header (type uint8, length uint16 big-endian) + payload
3. Type 0x01 (UUID): Read 16 bytes, create call via `call_manager.add_call(f'asterisk-{uuid}')`
4. Type 0x10 (audio): Read 320 bytes (20ms at 8kHz 16-bit), call `decode_asterisk_chunk()` and push to detector
5. Type 0x00 (hangup): Disconnect call, clean up
6. Type 0x03 (DTMF): Log the digit
7. Uses `asyncio.StreamReader.readexactly()` for safe TCP reads
8. 60-second idle timeout
9. Exports `start_audiosocket_server()` coroutine
10. Does NOT require WebSocket — uses `call_manager` directly, BatchWorker polls from `call_manager.get_all_calls()`"

**Critical implementation notes to include in prompt:**
- `np.frombuffer(...).copy()` — MUST copy, frombuffer returns read-only
- Use `struct.unpack('>BH', header)` for big-endian header parsing
- TCP recv must use `readexactly(n)` — TCP doesn't guarantee packet boundaries
- Add per-connection error handling with `try/finally` for cleanup

### Step 2.2 — Add Decode Function
**Prompt:** "Add `decode_asterisk_chunk(raw_bytes: bytes) -> np.ndarray` to the end of `server/audio_utils.py`. It should:
1. `np.frombuffer(raw_bytes, dtype=np.int16).copy()` — 8kHz signed linear LE
2. Convert to float32: divide by 32768.0
3. Resample 8kHz → 16kHz using existing `_resample()`
4. Apply `_lufs_normalize()`
5. Apply `np.nan_to_num()`
Return float32 mono array at 16kHz."

### Step 2.3 — Wire Into Server Lifespan
**Prompt:** "In `server/main.py`, add 2 lines inside the `lifespan()` function after `asyncio.create_task(batch_inference_worker())`:
```python
from server.audiosocket_server import start_audiosocket_server
asyncio.create_task(start_audiosocket_server())
```"

### Step 2.4 — Add Config
**Prompt:** "Add to end of `config.yaml`:
```yaml
asterisk:
  audiosocket_host: '0.0.0.0'
  audiosocket_port: 1579
```
And load these values in `server/config.py`."

### Step 2.5 — Verify
```powershell
# Start VoiceTrace
uvicorn server.main:app --host 0.0.0.0 --port 8000

# In new terminal — check TCP port is listening
Test-NetConnection -ComputerName localhost -Port 1579
# Expected: TcpTestSucceeded : True

# Check server logs for:
# "AudioSocket server listening on 0.0.0.0:1579"
```

### ⚠️ Phase 2 Risks

| # | Risk | What Happens | How to Fix |
|---|------|-------------|------------|
| 1 | Partial TCP read | Audio bytes are corrupted | Use `reader.readexactly(length)` — raises `IncompleteReadError` if connection drops |
| 2 | Port 1579 conflict | Server won't start | Change port in `config.yaml`, update Asterisk dialplan to match |
| 3 | `connect_call()` needs WebSocket | TypeError on call setup | Use `call_manager.add_call()` directly — it doesn't need WebSocket |
| 4 | Byte order wrong | Audio sounds garbled | AudioSocket header = big-endian (`>BH`), PCM payload = little-endian (x86 native `np.int16`) |

### ✅ Phase 2 Done When
- [  ] VoiceTrace starts without errors
- [  ] Port 1579 is listening
- [  ] Server logs show "AudioSocket server listening on..."

---

## Phase 3 — Dialplan Wiring

### Goal
Connect Asterisk to VoiceTrace — a test call from a SIP softphone should produce risk scores on the dashboard.

### Step 3.1 — Install SIP Softphone
**Prompt:** "Download and install Zoiper or MicroSIP on your PC. Configure it with:
- Server: `127.0.0.1` (or Docker host IP)
- Port: 5060
- Username: `test`
- Password: `test1234`
- Transport: UDP"

### Step 3.2 — Generate Welcome Audio
```powershell
# Generate welcome message WAV file
python -c "
import pyttsx3
engine = pyttsx3.init()
engine.save_to_file(
    'VoiceTrace active. This call is being monitored for AI voice cloning.',
    'deploy/asterisk/audio/voicetrace-welcome.wav'
)
engine.runAndWait()
print('Generated voicetrace-welcome.wav')
"
```

### Step 3.3 — Restart Asterisk (to pick up new audio)
```powershell
cd deploy/asterisk
docker-compose restart
```

### Step 3.4 — Make Test Call
```
1. Open Zoiper/MicroSIP
2. Register to Asterisk (should show "Registered" or green icon)
3. Dial extension: 100
4. You should hear: "VoiceTrace active..."
5. Start speaking
6. Open dashboard: http://localhost:5173
7. You should see risk scores appearing for "asterisk-XXXX" call
8. Hang up
9. Check VoiceTrace logs for cleanup message
```

### Step 3.5 — Verify End-to-End
```powershell
# Asterisk CLI — check active channels during call
docker exec -it voicetrace-asterisk asterisk -rx "core show channels"
# Should show 1 active channel during call

# VoiceTrace logs should show:
# "audiosocket  call=asterisk-XXXX  connected"
# "process  call=asterisk-XXXX  window=0  risk=XX  band=low  latency=XXms"
# "audiosocket  call=asterisk-XXXX  disconnected"
```

### ⚠️ Phase 3 Risks

| # | Risk | What Happens | How to Fix |
|---|------|-------------|------------|
| 1 | Softphone can't register | "403 Forbidden" or timeout | Check `pjsip.conf` endpoint config, verify username/password |
| 2 | AudioSocket connection refused | Asterisk logs "Connection refused :1579" | Ensure VoiceTrace is running BEFORE making the call |
| 3 | No audio in dashboard | Call connects but no scores appear | Check AudioSocket server logs — may be a protocol parsing error |
| 4 | WAV file not found by Playback() | "File not found" in Asterisk CLI | Verify WAV is in `deploy/asterisk/audio/` and volume is mounted correctly |

### ✅ Phase 3 Done When
- [  ] Softphone registers to Asterisk
- [  ] Test call produces "VoiceTrace active" announcement
- [  ] Dashboard shows risk scores for the call
- [  ] Hang up triggers clean disconnect

---

## Phase 4 — Alert Delivery

### Goal
When clone detection fires (`band=high`), send alerts via Telegram and/or webhook.

### Step 4.1 — Create Telegram Bot (Optional)
```
1. Open Telegram, search for @BotFather
2. Send: /newbot
3. Name: VoiceTrace Alert Bot
4. Username: voicetrace_alert_bot (must be unique)
5. Copy the API token
6. Send a message to your bot (to initialize the chat)
7. Get your chat_id:
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   # Find: "chat":{"id":XXXXXXX}
8. Add to config.yaml:
   alerts:
     telegram_bot_token: "YOUR_TOKEN"
     telegram_chat_id: "YOUR_CHAT_ID"
```

### Step 4.2 — Create Alert Dispatcher
**Prompt:** "Create `server/alert_dispatcher.py` with:
1. `async dispatch_alert(call_id, risk_event_dict)` — main entry point
2. Telegram: HTTP POST to `api.telegram.org/bot{token}/sendMessage` with formatted risk details
3. Webhook: HTTP POST with JSON body `{call_id, risk_score, band, timestamp, recommendation}`
4. Deduplication: Accept a `already_alerted: bool` flag, skip if True
5. Use `aiohttp` or `httpx` for async HTTP (httpx already in requirements)
6. Fire-and-forget: wrap in `asyncio.create_task()`, never block the main pipeline
7. Log all dispatch attempts and failures"

### Step 4.3 — Wire Into Batch Worker
**Prompt:** "In `server/batch_worker.py`, after the existing incident report logic (line ~142), add alert dispatch:
```python
if risk_event.band == 'high' and not state.incident_generated:
    # ... existing incident_report code ...
    asyncio.create_task(dispatch_alert(call_id, risk_event.to_dict()))
```"

### Step 4.4 — Test Alerts
```powershell
# 1. Configure Telegram bot in config.yaml
# 2. Start VoiceTrace
# 3. Make a test call via softphone
# 4. Play a TTS/AI-generated voice sample into the softphone mic
# 5. Within ~2 seconds:
#    - Dashboard shows band=high
#    - Telegram bot sends alert message
```

### ⚠️ Phase 4 Risks

| # | Risk | What Happens | How to Fix |
|---|------|-------------|------------|
| 1 | Telegram API blocked in network | HTTP POST fails | Use webhook to an accessible endpoint instead |
| 2 | Alert fires on every high window | Spam | Use `state.incident_generated` flag — only first high window triggers |
| 3 | Alert slows down pipeline | Inference latency increases | `asyncio.create_task()` — fire and forget, never await in hot path |

### ✅ Phase 4 Done When
- [  ] Telegram bot sends alert on `band=high`
- [  ] Alert fires only once per call (not per window)
- [  ] Pipeline latency unchanged (< 50ms)

---

## Phase 5 — Testing & Validation

### Goal
Verify the entire Asterisk→VoiceTrace pipeline works correctly with zero errors.

### Step 5.1 — Create Test Client
**Prompt:** "Create `tests/test_audiosocket_client.py` that:
1. Opens TCP connection to `localhost:1579`
2. Sends AudioSocket UUID packet (type=0x01, length=16, payload=random UUID bytes)
3. Reads a WAV file from `samples/` directory
4. Resamples to 8kHz mono if needed
5. Chunks audio into 320-byte frames (20ms at 8kHz 16-bit)
6. Sends each chunk as AudioSocket audio packet (type=0x10, length=320, payload=chunk)
7. Adds 20ms delay between chunks (simulates real-time)
8. Sends hangup packet (type=0x00, length=0)
9. Reports total bytes sent, duration, and chunks count"

### Step 5.2 — Run Unit Tests
```powershell
# Test AudioSocket protocol parsing
python tests/test_audiosocket_client.py

# Run existing test suite (should still pass — nothing broken)
pytest tests/ -v --tb=short
```

### Step 5.3 — Cross-Path Audio Validation
```powershell
# Send same WAV file through Twilio path and Asterisk path
# Compare risk scores

# Asterisk path:
python tests/test_audiosocket_client.py --file samples/spoof_hindi.wav
# Note the risk_score from dashboard

# Twilio path (file upload, which uses telephony simulation):
curl -X POST http://localhost:8000/analyze -H "X-Api-Key: dev_key_123" -F "file=@samples/spoof_hindi.wav"
# Compare risk_score

# PASS if both produce band=high and scores within ±5 points
```

### Step 5.4 — Stress Test
```powershell
# Open 3 terminal windows, run test client simultaneously in each:
# Terminal 1:
python tests/test_audiosocket_client.py --file samples/genuine_hindi.wav
# Terminal 2:
python tests/test_audiosocket_client.py --file samples/spoof_hindi.wav  
# Terminal 3:
python tests/test_audiosocket_client.py --file samples/genuine_english.wav

# Dashboard should show 3 independent calls with correct risk bands
```

### ⚠️ Phase 5 Risks

| # | Risk | What Happens | How to Fix |
|---|------|-------------|------------|
| 1 | Test WAV files not available | Tests can't run | Generate test files using `pyttsx3` for TTS samples |
| 2 | Concurrent TCP connections crash server | Server overloaded | Verify `MAX_CALLS` limit works for AudioSocket too |

### ✅ Phase 5 Done When
- [  ] `test_audiosocket_client.py` runs and produces dashboard scores
- [  ] Genuine voice → `band=low` ✅
- [  ] TTS voice → `band=high` ✅
- [  ] 3 concurrent calls work independently ✅
- [  ] Existing `pytest tests/` still passes ✅
- [  ] Cross-path scores match within ±5 points ✅

---

## Risk Summary Table

### By Severity

| Severity | Count | Examples |
|----------|-------|---------|
| 🔴 **HIGH** (blocks demo) | 3 | Docker not installed, AudioSocket module missing, TCP framing bug |
| 🟡 **MEDIUM** (degraded demo) | 5 | Port conflicts, WAV not found, codec mismatch, alert spam, cross-path score delta |
| 🟢 **LOW** (cosmetic) | 4 | Log formatting, welcome audio quality, softphone UI issues, config naming |

### By Phase

| Phase | 🔴 High | 🟡 Medium | 🟢 Low | Total |
|-------|---------|-----------|--------|-------|
| Phase 1 | 2 | 1 | 1 | 4 |
| Phase 2 | 1 | 2 | 1 | 4 |
| Phase 3 | 0 | 3 | 1 | 4 |
| Phase 4 | 0 | 2 | 1 | 3 |
| Phase 5 | 0 | 1 | 0 | 1 |

### Mitigation Summary
- **All 🔴 HIGH risks** are pre-checked before demo day via the Pre-Flight Checklist
- **All 🟡 MEDIUM risks** have documented fallback procedures
- **Twilio remains functional** as the nuclear fallback option

---

## SIH Demo Day Runbook

### 30 Minutes Before Demo

```powershell
# 1. Start VoiceTrace backend
cd c:\Users\padra\Desktop\SIH 2026
uvicorn server.main:app --host 0.0.0.0 --port 8000

# 2. Start Asterisk
cd deploy/asterisk
docker-compose up -d

# 3. Start Dashboard
cd dashboard
npm run dev

# 4. Verify health
curl http://localhost:8000/health
# Expected: {"status":"ok", ...}

# 5. Verify AudioSocket port
Test-NetConnection -ComputerName localhost -Port 1579
# Expected: TcpTestSucceeded : True

# 6. Verify Asterisk
docker exec -it voicetrace-asterisk asterisk -rx "core show channels"
# Expected: "0 active channels"

# 7. Make a quick test call from Zoiper
# Dial 100, speak briefly, check dashboard shows scores
# Hang up
```

### During Demo (for Judges)

```
1. Show the dashboard running (http://localhost:5173)
2. Show the architecture diagram (Asterisk → AudioSocket → VoiceTrace → Dashboard)
3. Live demo:
   a. Call the Asterisk number from Zoiper/mobile
   b. Speak normally — show band=low (green) on dashboard
   c. Play a TTS sample into the phone — show band=high (red) on dashboard
   d. Show the Telegram alert that fired
   e. Show sub-signal scores (spectral artifacts, prosody, etc.)
4. Talk about:
   - Self-hosted, open-source telephony (no vendor lock-in)
   - Indian PSTN integration ready (Exotel/KnowLarity SIP trunk)
   - DPDP Act compliance (no audio stored)
   - <200ms inference latency
```

### If Something Goes Wrong

| Problem | Immediate Fix |
|---------|---------------|
| Asterisk won't start | Skip to Twilio fallback — call Twilio number instead |
| AudioSocket not connecting | Restart VoiceTrace, check port 1579 |
| Dashboard shows no scores | Use `POST /analyze` with file upload instead (always works) |
| Model not loaded | Wait 30s for warmup, check `/health` endpoint |
| Everything broken | Demo file upload via `curl /analyze` + show results on screen |
