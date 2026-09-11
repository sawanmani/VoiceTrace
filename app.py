import spaces
import gradio as gr
import numpy as np
import torch
import tempfile
import soundfile as sf

from server.main import app as fastapi_app
from fastapi import Request

# ZeroGPU requires at least one FastAPI route to be decorated with @spaces.GPU 
# if the main app is a FastAPI instance. This dummy route satisfies the startup check.
@fastapi_app.get("/_zerogpu_dummy")
@spaces.GPU(duration=10)
def _zerogpu_dummy(request: Request):
    return {"status": "ok"}

@spaces.GPU(duration=60)
def analyze_audio(audio_path):
    """
    Real GPU-backed inference function.
    ZeroGPU allocates GPU when this function is called through Gradio.
    """
    if audio_path is None:
        return "❌ No audio provided", "{}"

    # Import inside function so GPU is allocated before model loads
    from detector.streaming import StreamingDetector
    from server.risk_engine import RiskEngine
    import uuid, json

    detector = StreamingDetector()
    risk_engine = RiskEngine()

    # Load audio
    from server.audio_utils import file_bytes_to_pcm
    with open(audio_path, "rb") as f:
        audio_data = f.read()

    try:
        audio = file_bytes_to_pcm(audio_data)
    except Exception as e:
        return f"❌ Audio decode failed: {e}", "{}"

    call_id = f"gradio-{uuid.uuid4().hex[:8]}"
    results = detector.push_full(audio)

    if not results:
        return "❌ Audio too short — need at least 1 second", "{}"

    events = [risk_engine.score(r, call_id).to_dict() for r in results]

    # Summary
    peak = max(e["risk_score"] for e in events)
    band = events[-1]["band"]
    recommendation = events[-1]["recommendation"]

    summary = (
        f"🎯 Risk Score: {peak}/100\n"
        f"🔴 Band: {band.upper()}\n"
        f"📊 Windows Analyzed: {len(events)}\n"
        f"⏱️ Avg Latency: {sum(e['latency_ms'] for e in events)/len(events):.1f}ms\n\n"
        f"💡 {recommendation}"
    )

    return summary, json.dumps(events, indent=2)


# Build Gradio interface
demo = gr.Interface(
    fn=analyze_audio,
    inputs=gr.Audio(type="filepath", label="Upload Voice Audio"),
    outputs=[
        gr.Textbox(label="Detection Result", lines=6),
        gr.Code(label="Raw Events (JSON)", language="json"),
    ],
    title="🛡️ VoiceTrace — AI Voice Clone Detection",
    description=(
        "Upload a voice recording to detect AI-generated clones in real-time. "
        "Powered by AASIST-L neural network. SIH 2026 · PSID 260104"
    ),
    examples=[],
    allow_flagging="never",
)

# Mount FastAPI INSIDE Gradio (both work on same port 7860)
app = gr.mount_gradio_app(fastapi_app, demo, path="/")
