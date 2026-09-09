"""
Export VoiceTrace AASIST-L to ONNX format.
This allows running the model on edge devices (Android/iOS) using ONNX Runtime.
"""

import torch
import os
from pathlib import Path
import sys

# Add project root to sys.path so we can import from detector
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from detector.inference import load_model, DEFAULT_CHECKPOINT, AASIST_L_CONFIG

def export_to_onnx():
    print("Loading PyTorch model...")
    device = "cpu"
    try:
        model = load_model(DEFAULT_CHECKPOINT, device)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return

    # Create dummy input based on model's expected input shape
    # AASIST-L expects (batch_size, num_samples)
    batch_size = 1
    # We use 64600 as defined in the config (approx 4 seconds at 16kHz)
    dummy_input = torch.randn(batch_size, AASIST_L_CONFIG["nb_samp"])

    export_path = Path("models/weights/AASIST-L.onnx")
    export_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Exporting model to {export_path}...")
    torch.onnx.export(
        model,
        dummy_input,
        str(export_path),
        export_params=True,
        opset_version=14,  # Opset 14 is widely supported
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size", 1: "num_samples"},
            "output": {0: "batch_size"}
        }
    )

    print("ONNX export complete.")
    
    # Apply INT8 Quantization
    from onnxruntime.quantization import quantize_dynamic, QuantType
    quantized_model_path = Path("models/weights/AASIST-L-quantized.onnx")
    print(f"Applying INT8 quantization to {quantized_model_path}...")
    
    try:
        quantize_dynamic(
            str(export_path),
            str(quantized_model_path),
            weight_type=QuantType.QUInt8
        )
        q_size_mb = os.path.getsize(quantized_model_path) / (1024 * 1024)
        print(f"Quantized edge model size: {q_size_mb:.2f} MB")
    except Exception as e:
        print(f"Quantization failed (this is common for dynamic graphs with complex ops): {e}")
        print("You can still use the unquantized model for inference.")
    
    # Check file size
    size_mb = os.path.getsize(export_path) / (1024 * 1024)
    print(f"Original exported model size: {size_mb:.2f} MB")

if __name__ == "__main__":
    export_to_onnx()
