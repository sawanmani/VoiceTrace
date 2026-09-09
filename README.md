---
title: VoiceTrace Backend
emoji: 🎙️
colorFrom: blue
colorTo: green
sdk: gradio
sdk_version: 4.40.0
app_file: app.py
pinned: false
---

# VoiceTrace

VoiceTrace is a real-time, enterprise-grade AI voice cloning detection system. It monitors VoIP calls (via WebRTC, Free SIP/Asterisk, or Twilio) and statically analyzes pre-recorded audio files to detect deepfakes using the AASIST-L neural network.

## Quick Start

### 1. Start the Server
```bash
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
```

### 2. Start the Free Phone PBX (Asterisk)
```bash
docker-compose up -d --build asterisk
```
*(Connects with SIP2SIP/Linphone or local MicroSIP for 100% free telephony detection)*

### 3. Static Analysis via REST
Use curl to analyze an audio file:
```bash
curl -X POST http://localhost:8000/analyze \
  -H "X-Api-Key: dev_key_123" \
  -F "file=@samples/genuine_english.wav"
```

### 4. Live Streaming via WebSocket
Stream audio chunks (Float32 PCM) directly to the detector:
```javascript
const ws = new WebSocket("ws://localhost:8000/ws/call/my-call-1?api_key=dev_key_123");
ws.onopen = () => {
    // Send raw Float32 audio bytes
    ws.send(new Float32Array([...audioData]).buffer);
};
```

## Documentation
- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Deployment / Roadmap](VoiceTrace_Stepwise_Build_Plan_and_Growth_Roadmap.md)
