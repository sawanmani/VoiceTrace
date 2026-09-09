import spaces
from server.main import app

# DO NOT create a Gradio interface here! 
# If Hugging Face sees a Gradio interface, it ignores our FastAPI app.
# By only exposing `app`, Hugging Face will serve our FastAPI backend directly using Uvicorn!

@spaces.GPU
def _dummy_gpu_function_for_hf_check():
    # Hugging Face ZeroGPU requires at least one function to have the @spaces.GPU decorator.
    # We just put it here so the Space passes the hardware check.
    pass
