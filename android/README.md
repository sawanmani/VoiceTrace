# VoiceTrace — Android Edge Client (Phase 2 Roadmap)

> **Status:** Scaffold only. Not connected to the WebSocket API in the current MVP.
> The Phase 1 MVP uses browser-based WebRTC mic streaming + REST file upload.

This directory contains the **architectural design** for the VoiceTrace native Android application (Phase 2).

## Architecture

Unlike the Phase 1 web demo, the native Android application intercepts calls directly at the OS level. It uses the Android Telecom framework to become the user's Default Dialer (`InCallService`).

1. **`VoiceTraceInCallService.kt`**: Hook into the cellular stack to receive raw PCM audio streams for incoming and outgoing cellular network calls.
2. **Edge Inference**: Pass the raw audio streams directly into the `AASIST-L-quantized.onnx` model (deployed via `onnxruntime-android`).
3. **SYSTEM_ALERT_WINDOW**: Draw a floating green/red risk bubble on top of the native dialer UI in real-time, warning the user if the voice clone probability is high.

## Phase 1 vs Phase 2 Comparison

| Capability | Phase 1 (Current MVP) | Phase 2 (Android Edge) |
|-----------|----------------------|----------------------|
| **Audio Source** | Browser mic / Twilio / Asterisk SIP | Native cellular stack |
| **Inference** | Server-side (GPU/CPU batched) | On-device ONNX Runtime |
| **Latency** | ~200ms (network + inference) | ~100ms (local inference) |
| **Connectivity** | Requires server connection | Works offline after model download |
| **Integration** | Web dashboard + SIP softphone | Native dialer overlay |

## Prerequisites for Phase 2

1. ONNX model export (already available: `deploy/onnx_export.py`)
2. Android Studio + Physical device (emulators can't test cellular audio)
3. ONNX Runtime Android SDK
4. `SYSTEM_ALERT_WINDOW` permission

## Setup (When Ready)
1. Open this `android/` directory in Android Studio.
2. Build the project using Gradle.
3. Deploy to a physical Android device (emulators cannot reliably test cellular audio injection).
4. Go to **Settings > Apps > Default Apps > Phone app** and select VoiceTrace.
