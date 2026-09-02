# VoiceTrace — Twilio Demo Setup Guide

**For SIH 2026 demo day. Time to set up: ~5 minutes.**

---

## Prerequisites

- VoiceTrace backend running locally on port 8000
- A Twilio account with a purchased phone number
- `cloudflared.exe` in the project root (already present)

---

## Step 1 — Start the Backend

```powershell
# From c:\voicetrace
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

Verify: open `http://localhost:8000/health` — should return `{"status":"ok",...}`.

---

## Step 2 — Start a cloudflared Tunnel

```powershell
# From c:\voicetrace
.\cloudflared.exe tunnel --url http://localhost:8000
```

You'll see output like:
```
Your quick Tunnel has been created! Visit it at:
https://random-words-here.trycloudflare.com
```

Copy that URL. **This is your `TUNNEL_URL`.**

> ⚠️ The tunnel URL changes every time you restart cloudflared.
> Update the Twilio webhook URL if you restart.

---

## Step 3 — Configure Twilio Webhook

1. Go to **[Twilio Console](https://console.twilio.com)** → **Phone Numbers** → **Active Numbers**
2. Click your Twilio phone number
3. Under **"Voice & Fax"** → **"A Call Comes In"**:
   - Set to: **Webhook**
   - URL: `https://<TUNNEL_URL>/twilio/incoming`
   - Method: **HTTP POST**
4. Click **Save**

**Example URL:** `https://random-words-here.trycloudflare.com/twilio/incoming`

---

## Step 4 — Start the Dashboard

```powershell
# In a new terminal, from c:\voicetrace\dashboard
npm run dev
```

Open `http://localhost:5173` — you should see the VoiceTrace dashboard.

---

## Step 5 — Make the Demo Call

1. **Dial your Twilio number** from any mobile phone
2. You'll hear: *"VoiceTrace active. This call is being monitored for AI voice cloning."*
3. The call will stay connected (no 60-second hangup — Fix 2 applied)
4. Watch the dashboard — within 2–3 seconds of speaking, risk scores appear

---

## Step 6 — Demo the Clone Detection

### Genuine voice baseline:
- Speak naturally into the phone → dashboard should show **green / low risk**

### Clone simulation (for judges):
- Use a second device or laptop to play a TTS/AI voice sample into the phone's mic
  (hold the speaker close, or use a Bluetooth headset)
- Alternatively: use Twilio's test call with audio injection (see below)
- Dashboard should show **orange/red within 2–3 windows** (~1–1.5 seconds)

### Using a pre-recorded spoof sample:
```powershell
# From c:\voicetrace — POST the spoof clip to /analyze for a quick sanity check
curl -X POST http://localhost:8000/analyze \
  -H "X-Api-Key: $env:VOICETRACE_API_KEY" \
  -F "file=@samples/spoof_hindi.wav"
```
Expected: `"band": "high"`, `risk_score > 65`

---

## Environment Variables for Production Validation

Add to `.env` before demo:

```env
VOICETRACE_API_KEY=<your-key>
TWILIO_AUTH_TOKEN=<from Twilio Console → Account → Auth Token>
TWILIO_VALIDATE_SIGNATURE=false   # set true only for hardened demo
```

---

## Verification Checklist

- [ ] `GET /health` returns `{"status": "ok", ...}`
- [ ] `POST /twilio/incoming` returns TwiML with `<Connect><Stream ...`
- [ ] Cloudflared tunnel is running and URL is updated in Twilio Console
- [ ] Calling the Twilio number plays the VoiceTrace announcement
- [ ] Dashboard shows score updates within 2 seconds of speaking
- [ ] Spoof sample raises `band=high` on the dashboard
- [ ] `pytest tests/ -v` all green

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Call hangs up after ~60s | Old `<Pause>` TwiML was cached | Hard-reload Twilio webhook; redeploy |
| Dashboard shows no scores | WebSocket not reaching backend | Check CORS in `.env`; confirm tunnel URL |
| `ws://` in TwiML instead of `wss://` | Host header not detected | Confirm cloudflared URL contains `trycloudflare` |
| Tunnel URL changed | cloudflared restarted | Update Twilio Console webhook URL |
| Signature validation error | Wrong `TWILIO_AUTH_TOKEN` | Set `TWILIO_VALIDATE_SIGNATURE=false` for demo |

---

## Architecture Reminder

```
Phone call (Twilio network)
       │
       ▼
Twilio forks audio → POST /twilio/incoming → TwiML <Connect><Stream wss://...>
       │
       ▼
WS /ws/twilio (receives base64 µ-law 8kHz chunks every 20ms)
       │
       ▼
decode_twilio_chunk() → float32 16kHz PCM
       │
       ▼
StreamingDetector.push() → BatchWorker → RiskEngine
       │
       ▼
WebSocket broadcast → Dashboard overlay
```

**End-to-end latency: ~1.0–1.5 seconds** (window accumulation + inference + WS push)
