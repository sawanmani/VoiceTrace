# VoiceTrace — Android Edge Client

This directory contains the scaffolding for the VoiceTrace native Android application (Phase 3). 

## Architecture

Unlike the Phase 1 web demo, the native Android application intercepts calls directly at the OS level. It uses the Android Telecom framework to become the user's Default Dialer (`InCallService`).

1. **`VoiceTraceInCallService.kt`**: Hook into the cellular stack to receive raw PCM audio streams for incoming and outgoing cellular network calls.
2. **Edge Inference**: Pass the raw audio streams directly into the `AASIST-L-quantized.onnx` model (deployed via `onnxruntime-android`).
3. **SYSTEM_ALERT_WINDOW**: Draw a floating green/red risk bubble on top of the native dialer UI in real-time, warning the user if the voice clone probability is high.

## Setup
1. Open this `android/` directory in Android Studio.
2. Build the project using Gradle.
3. Deploy to a physical Android device (emulators cannot reliably test cellular audio injection).
4. Go to **Settings > Apps > Default Apps > Phone app** and select VoiceTrace.
