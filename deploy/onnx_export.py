"""
VoiceTrace — deploy/onnx_export.py (F9)

Exports the PyTorch AASIST-L model to ONNX format for zero-dependency CPU
inference in data-residency-constrained banking environments.
"""

import argparse
from pathlib import Path
import torch

from detector.inference import load_model, DEFAULT_CHECKPOINT, AASIST_L_CONFIG

def export_onnx(checkpoint_path: Path, output_path: Path):
    print(f"Loading PyTorch model from {checkpoint_path}")
    model = load_model(checkpoint_path, device="cpu")
    model.eval()
    
    # Dummy input matching the expected shape: (batch_size, nb_samp)
    dummy_input = torch.randn(1, AASIST_L_CONFIG["nb_samp"])
    
    print(f"Exporting to ONNX at {output_path}")
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["audio_input"],
        output_names=["last_hidden", "logits"],
        dynamic_axes={
            "audio_input": {0: "batch_size"},
            "last_hidden": {0: "batch_size"},
            "logits": {0: "batch_size"}
        }
    )
    print("Export complete. The model is now ready for edge deployment.")
    
    # Apply INT8 Quantization
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantized_model_path = output_path.with_name(output_path.stem + "-quantized.onnx")
        print(f"Applying INT8 quantization to {quantized_model_path}...")
        quantize_dynamic(
            str(output_path),
            str(quantized_model_path),
            weight_type=QuantType.QUInt8
        )
        import os
        q_size_mb = os.path.getsize(quantized_model_path) / (1024 * 1024)
        print(f"Quantized edge model size: {q_size_mb:.2f} MB")
        
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        print(f"Original exported model size: {size_mb:.2f} MB")
    except ImportError:
        print("onnxruntime not installed, skipping quantization.")
    except Exception as e:
        print(f"Quantization failed: {e}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--output", type=str, default="models/weights/AASIST-L.onnx")
    args = parser.parse_args()
    
    export_onnx(Path(args.checkpoint), Path(args.output))

if __name__ == "__main__":
    main()
