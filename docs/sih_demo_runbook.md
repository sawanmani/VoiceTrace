# VoiceTrace — SIH 2026 Demo Day Runbook

> PSID 260104 | Team VoiceTracers | ₹0 Budget

## 30 Minutes Before Demo

### Startup Sequence
```powershell
# Terminal 1 — Backend
cd c:\voicetrace
uvicorn server.main:app --host 0.0.0.0 --port 8000

# Terminal 2 — Asterisk (WSL2)
wsl -e sudo asterisk -cvvvvv

# Terminal 3 — Dashboard
cd c:\voicetrace\dashboard
npm run dev
```

### Health Checks
```powershell
curl http://localhost:8000/health
Test-NetConnection -ComputerName localhost -Port 1579
wsl -e sudo asterisk -rx "module show like audiosocket"
```

### Quick Test Call
1. Open Linphone, verify registered
2. Dial 100, speak 5 seconds
3. Check dashboard shows scores
4. Hang up — ready!

## 5-Minute Demo Script

**MINUTE 0-1**: Problem statement + architecture
**MINUTE 1-2**: Live genuine call → band=low (green)
**MINUTE 2-3**: Play AI voice → band=high (red) + Telegram alert
**MINUTE 3-4**: Technical depth — self-hosted, DPDP compliant, <200ms
**MINUTE 4-5**: Twilio fallback + file upload + scalability

## Emergency Fallbacks

| What Breaks | Immediate Fix |
|-------------|---------------|
| Asterisk won't start | File upload demo via curl /analyze |
| AudioSocket stuck | Restart VoiceTrace, wait 10s |
| Dashboard blank | curl /analyze + terminal output |
| Model not loaded | Wait 30s, check /health |
| Everything broken | curl -X POST localhost:8000/analyze -F "file=@samples/spoof_hindi.wav" |

## Key Talking Points
- ₹0 cost, fully open-source
- DPDP Act compliant — no audio stored
- <200ms real-time inference on CPU
- Indian PSTN ready (Exotel SIP trunk)
- Multi-signal explainability
- Dual telephony backend (Asterisk + Twilio)
