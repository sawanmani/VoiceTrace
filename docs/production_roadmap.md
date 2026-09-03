# VoiceTrace — Production Roadmap

## Current (SIH Demo)
- Real-time clone detection via AASIST-L
- Asterisk PBX + Twilio dual backend
- Dashboard, Telegram alerts, incident reports
- DPDP Act compliant

## Phase A — Indian PSTN (₹2000/mo)
- Exotel/KnowLarity SIP trunk for +91 numbers
- Just change pjsip.conf trunk section
- No Python code changes

## Phase B — Horizontal Scaling
- Docker Compose: Asterisk + VoiceTrace + Redis
- Redis pub/sub already coded in pubsub.py
- GPU inference for higher throughput

## Phase C — Advanced Features
- Speaker verification (placeholder in CallContext)
- Challenge-response (challenge.py exists)
- ONNX edge deployment (export script exists)
- Active learning via /feedback endpoint
