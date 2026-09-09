import uvicorn
from server.main import app

if __name__ == "__main__":
    # Hugging Face Gradio spaces automatically execute this file
    # and expose port 7860 to the outside world.
    uvicorn.run(app, host="0.0.0.0", port=7860)
