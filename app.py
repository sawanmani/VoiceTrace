import gradio as gr
import spaces
from server.main import app as fastapi_app

# Dummy GPU function to satisfy Hugging Face ZeroGPU requirements
@spaces.GPU
def gpu_health_check():
    return "ZeroGPU is successfully initialized and VoiceTrace Backend is running!"

# Create a small Gradio interface
demo = gr.Interface(
    fn=gpu_health_check,
    inputs=None,
    outputs="text",
    title="VoiceTrace Backend Status",
    description="This is the Hugging Face ZeroGPU proxy for the VoiceTrace API."
)

# Mount the dummy Gradio app onto our FastAPI backend at the root path.
# Hugging Face Spaces will automatically find this `app` variable and run it!
app = gr.mount_gradio_app(fastapi_app, demo, path="/")
