"""
VoiceTrace — eval/adversarial_corpus.py (F4)

Generates adversarial perturbations (FGSM) against AASIST-L to test robustness.
This expands the threat taxonomy beyond simple TTS to adaptive attackers.
"""

import argparse
import torch
import torch.nn.functional as F
import soundfile as sf
import numpy as np
from pathlib import Path

from detector.inference import load_model, DEFAULT_CHECKPOINT, TARGET_SR, pad_or_trim, AASIST_L_CONFIG

def fgsm_attack(audio_tensor, epsilon, data_grad):
    # Collect the element-wise sign of the data gradient
    sign_data_grad = data_grad.sign()
    # Create the perturbed audio by adjusting each sample
    perturbed_audio = audio_tensor + epsilon * sign_data_grad
    # Clip to valid audio range [-1, 1]
    perturbed_audio = torch.clamp(perturbed_audio, -1.0, 1.0)
    return perturbed_audio

def generate_adversarial_example(model, audio_np, epsilon=0.01, device="cpu"):
    """
    Given a genuine audio sample, apply FGSM to try and make the model 
    classify it as spoofed (target label 1).
    """
    audio_fixed = pad_or_trim(audio_np, AASIST_L_CONFIG["nb_samp"])
    audio_tensor = torch.FloatTensor(audio_fixed).unsqueeze(0).to(device)
    audio_tensor.requires_grad = True
    
    _, logits = model(audio_tensor)
    
    # We want to push the prediction toward "spoof" (index 1)
    target_label = torch.tensor([1]).to(device)
    loss = F.cross_entropy(logits, target_label)
    
    model.zero_grad()
    loss.backward()
    
    data_grad = audio_tensor.grad.data
    perturbed_audio = fgsm_attack(audio_tensor, epsilon, data_grad)
    
    return perturbed_audio.squeeze(0).cpu().detach().numpy()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=str, help="Directory of clean genuine WAV files")
    parser.add_argument("output_dir", type=str, help="Directory to save adversarial WAV files")
    parser.add_argument("--epsilon", type=float, default=0.01, help="Perturbation strength")
    args = parser.parse_args()
    
    in_dir = Path(args.input_dir)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = load_model(DEFAULT_CHECKPOINT, device)
    model.eval()
    
    files = list(in_dir.glob("*.wav"))
    for f in files:
        audio, sr = sf.read(f)
        # Ensure 16kHz mono
        if sr != TARGET_SR:
            from server.audio_utils import _resample
            audio = _resample(audio, sr, TARGET_SR)
        
        perturbed = generate_adversarial_example(model, audio, epsilon=args.epsilon, device=device)
        out_path = out_dir / f"{f.stem}_adv.wav"
        sf.write(out_path, perturbed, TARGET_SR)
        print(f"Generated {out_path}")

if __name__ == "__main__":
    main()
