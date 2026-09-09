"""
VoiceTrace — scripts/train_transformer.py

Multi-Dataset Training Pipeline for the VoiceTransformer.
Trains on ASVspoof, WaveFake, and In-The-Wild simultaneously.
"""

import os
import glob
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import torchaudio
from pathlib import Path

from detector.transformer_model import VoiceTransformer

# Set parameters
BATCH_SIZE = 16
EPOCHS = 50
LEARNING_RATE = 1e-4
DEVICE = torch.device("cpu")
TARGET_SR = 16000
SAMPLE_LENGTH = 64600  # ~4.04s

class MultiDomainDataset(Dataset):
    """
    Loads audio from different spoofing datasets and assigns a specific class label.
    0: Genuine
    1: ASVspoof Fake
    2: WaveFake
    3: In-The-Wild
    """
    def __init__(self, data_dirs: dict, max_length: int = SAMPLE_LENGTH):
        self.max_length = max_length
        self.samples = []
        
        # Format of data_dirs: {"genuine": [list_of_paths], "asvspoof": [...], ...}
        for label, class_idx in [("genuine", 0), ("asvspoof", 1), ("wavefake", 2), ("inthewild", 3)]:
            if label in data_dirs:
                for path in data_dirs[label]:
                    if os.path.isdir(path):
                        files = glob.glob(os.path.join(path, "**/*.wav"), recursive=True)
                        for f in files:
                            self.samples.append((f, class_idx))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        file_path, label = self.samples[idx]
        
        try:
            waveform, sr = torchaudio.load(file_path)
            
            # Resample if necessary
            if sr != TARGET_SR:
                resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=TARGET_SR)
                waveform = resampler(waveform)
            
            # Convert to mono
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
                
            waveform = waveform.squeeze(0)
            
            # Pad or trim to target length
            if waveform.size(0) < self.max_length:
                pad_size = self.max_length - waveform.size(0)
                waveform = nn.functional.pad(waveform, (0, pad_size))
            else:
                waveform = waveform[:self.max_length]
                
            return waveform, torch.tensor(label, dtype=torch.long)
        
        except Exception as e:
            # On error, return silence and Genuine (as a fallback)
            return torch.zeros(self.max_length), torch.tensor(0, dtype=torch.long)

def train_model():
    print(f"[INFO] Using device: {DEVICE}")
    
    # 1. Define paths (Update these when running on GPU server)
    data_dirs = {
        "genuine": ["./data/asvspoof_2019/LA/ASVspoof2019_LA_train/flac/bonafide"],
        "asvspoof": ["./data/asvspoof_2019/LA/ASVspoof2019_LA_train/flac/spoof"],
        "wavefake": ["./data/WaveFake/generated_audio"],
        "inthewild": ["./data/in_the_wild"]
    }
    
    # 2. Create DataLoader
    dataset = MultiDomainDataset(data_dirs)
    if len(dataset) == 0:
        print("[WARNING] No audio files found. Creating dummy data for testing.")
        # Dummy data for pipeline testing
        dataset.samples = [("dummy.wav", i % 4) for i in range(100)]
        
        # Override getitem for testing
        def dummy_getitem(idx):
            return torch.randn(SAMPLE_LENGTH), torch.tensor(dataset.samples[idx][1], dtype=torch.long)
        dataset.__getitem__ = dummy_getitem
        
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    
    # 3. Initialize Model
    model = VoiceTransformer(num_classes=4).to(DEVICE)
    
    # 4. Loss and Optimizer
    # CrossEntropyLoss expects logits and integer targets
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    
    # 5. Training Loop
    print(f"[INFO] Starting training for {EPOCHS} epochs...")
    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0
        
        for batch_idx, (waveforms, labels) in enumerate(loader):
            waveforms, labels = waveforms.to(DEVICE), labels.to(DEVICE)
            
            optimizer.zero_grad()
            logits = model(waveforms)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            _, predicted = torch.max(logits.data, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
            
            if batch_idx % 10 == 0:
                print(f"Epoch [{epoch+1}/{EPOCHS}] Batch [{batch_idx}/{len(loader)}] Loss: {loss.item():.4f}")
                
        epoch_acc = 100 * correct / total
        print(f"==> Epoch {epoch+1} Summary: Loss {total_loss/len(loader):.4f} | Acc {epoch_acc:.2f}%")
        
        # Save checkpoint
        torch.save(model.state_dict(), f"voicetransformer_epoch{epoch+1}.pth")

if __name__ == "__main__":
    train_model()
