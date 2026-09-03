# VoiceTrace — Asterisk End-to-End Test Guide

> SIH 2026 | PSID 260104

## 1. SIP Softphone Setup

### Option A: Linphone (Recommended, Cross-Platform)
1. Download from https://www.linphone.org/
2. Install and open
3. Go to **Settings → SIP Accounts → Add Account**
4. Configure:
   - **SIP Address**: `sip:voicetrace@127.0.0.1`
   - **Password**: `sih2026demo`
   - **Transport**: UDP
5. Verify: Status shows **Registered** (green icon)

### Option B: MicroSIP (Lightweight, Windows Only)
1. Download from https://www.microsip.org/
2. Install and open
3. Go to **Menu → Add Account**
4. Configure:
   - **SIP Server**: `127.0.0.1`
   - **SIP Port**: `5060`
   - **Username**: `voicetrace`
   - **Password**: `sih2026demo`
   - **Transport**: `UDP`
5. Verify: Shows **Online** status

### Codec Configuration
Ensure **G.711 μ-law (PCMU)** is enabled and set as the preferred codec.
This matches Asterisk's `allow=ulaw` configuration.

---

## 2. Pre-Flight Checklist

Run these commands BEFORE making a test call:

```powershell
# 1. VoiceTrace backend running?
curl http://localhost:8000/health
# Expected: {"status":"ok", ...}

# 2. AudioSocket TCP port listening?
Test-NetConnection -ComputerName localhost -Port 1579
# Expected: TcpTestSucceeded : True

# 3. Asterisk running? (in WSL2)
wsl -e sudo asterisk -rx "core show channels"
# Expected: "0 active channels"

# 4. AudioSocket modules loaded?
wsl -e sudo asterisk -rx "module show like audiosocket"
# Expected: 2 modules loaded and Running

# 5. Dashboard accessible?
# Open http://localhost:5173 in browser
# Expected: Empty dashboard, ready for incoming calls
```

---

## 3. Make the Test Call

1. **Open** Linphone/MicroSIP
2. **Verify** registration shows "Registered" / green icon
3. **Dial**: `100`
4. **Listen**: You should hear "VoiceTrace active. This call is being monitored..."
5. **Speak naturally** for 10-15 seconds
6. **Watch dashboard** at `http://localhost:5173`:
   - New call entry appears: `asterisk-XXXXXXXX`
   - Risk score updates in real-time
   - Band should show **low** (green) for genuine speech
7. **Play a TTS/AI voice** into your mic (use phone speaker with an AI voice)
   - Risk should jump to **medium** or **high** (orange/red)
8. **Hang up**
9. **Check server logs** for:
   ```
   audiosocket  call=asterisk-XXXX  connected
   process  call=asterisk-XXXX  window=0  risk=XX  band=low
   audiosocket  call=asterisk-XXXX  disconnected  duration=Xs
   ```

---

## 4. Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Softphone: "Registration Failed" | Wrong credentials or Asterisk not running | Check `pjsip.conf`, verify username=voicetrace password=sih2026demo, restart Asterisk |
| Softphone: "403 Forbidden" | Auth mismatch | Delete and re-add account in softphone |
| Asterisk: "Connection refused :1579" | VoiceTrace not running | Start VoiceTrace **before** making the call |
| Call connects, no dashboard scores | AudioSocket parsing error | Check VoiceTrace server logs for decode errors |
| Welcome audio too fast/slow | WAV not at 8kHz | Re-run `python scripts/generate_welcome_audio.py` |
| Welcome audio not found | File not copied to WSL2 | Run: `wsl -e sudo cp /mnt/c/voicetrace/deploy/asterisk/audio/voicetrace-welcome.wav /var/lib/asterisk/sounds/custom/` |
| Can't reach 127.0.0.1:5060 | WSL2 networking issue | Find WSL2 IP: `wsl hostname -I`, use that IP in softphone |
| Dashboard shows no calls | WebSocket not connected | Refresh dashboard page, check browser console |
| `/health` shows wrong active_calls | pubsub not incremented | Check `broker.increment_active_calls()` is called in audiosocket_server.py |
