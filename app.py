import spaces
import uvicorn
from server.main import app

@spaces.GPU
def _dummy_gpu_function_for_hf_check():
    pass

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
