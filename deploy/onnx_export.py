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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default=str(DEFAULT_CHECKPOINT))
    parser.add_argument("--output", type=str, default="models/weights/AASIST-L.onnx")
    args = parser.parse_args()
    
    export_onnx(Path(args.checkpoint), Path(args.output))

if __name__ == "__main__":
    main()
