"""
VoiceTrace — detector/transformer_model.py

A Transformer-based multi-class detector for audio anti-spoofing.
Replaces or augments the AASIST-L model.
Input: Raw 16kHz audio waveforms.
Output: Logits for 4 classes: 
    0: Genuine
    1: ASVspoof Fake (Legacy TTS/VC)
    2: WaveFake (Modern Vocoders)
    3: In-The-Wild (Unknown internet fakes)
"""

import math
import torch
import torch.nn as nn
import torchaudio

class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, dropout: float = 0.1, max_len: int = 5000):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model))
        pe = torch.zeros(max_len, 1, d_model)
        pe[:, 0, 0::2] = torch.sin(position * div_term)
        pe[:, 0, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor, shape [seq_len, batch_size, embedding_dim]
        """
        x = x + self.pe[:x.size(0)]
        return self.dropout(x)


class VoiceTransformer(nn.Module):
    def __init__(
        self, 
        num_classes: int = 4, 
        d_model: int = 128, 
        nhead: int = 4, 
        num_layers: int = 4,
        dim_feedforward: int = 512,
        dropout: float = 0.1,
        sample_rate: int = 16000
    ):
        super().__init__()
        
        # 1. Feature Extraction: Mel-Spectrogram
        # Converts (batch, time) -> (batch, freq, time)
        self.mel_spec = torchaudio.transforms.MelSpectrogram(
            sample_rate=sample_rate,
            n_fft=512,
            win_length=400,
            hop_length=160,
            n_mels=80,
            power=2.0
        )
        self.amplitude_to_db = torchaudio.transforms.AmplitudeToDB()

        # 2. Linear projection to map Mel-frequency bins to d_model
        # Mel spec output is (batch, n_mels, time_frames). 
        # We need (time_frames, batch, d_model) for Transformer.
        self.input_proj = nn.Linear(80, d_model)
        
        # 3. Positional Encoding
        self.pos_encoder = PositionalEncoding(d_model, dropout)
        
        # 4. Transformer Encoder
        encoder_layers = nn.TransformerEncoderLayer(
            d_model=d_model, 
            nhead=nhead, 
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            activation="gelu",
            batch_first=False
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layers, num_layers)
        
        # 5. Multi-class classification head
        self.classifier = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch_size, num_samples) raw audio waveform.
        Returns:
            logits: (batch_size, num_classes)
        """
        # Feature Extraction
        # x: (batch, time)
        mel = self.mel_spec(x)           # (batch, n_mels, time_frames)
        mel = self.amplitude_to_db(mel)  # (batch, n_mels, time_frames)
        
        # Prepare for Transformer
        # We need shape (seq_len, batch_size, embedding_dim)
        mel = mel.permute(2, 0, 1)       # (time_frames, batch, n_mels)
        
        # Project n_mels to d_model
        encoded = self.input_proj(mel)   # (time_frames, batch, d_model)
        
        # Add positional encoding
        encoded = self.pos_encoder(encoded)
        
        # Pass through Transformer
        output = self.transformer_encoder(encoded)  # (time_frames, batch, d_model)
        
        # Pooling: Mean over time
        # Mean pooling works well for speech classification
        pooled = output.mean(dim=0)  # (batch, d_model)
        
        # Classification
        logits = self.classifier(pooled) # (batch, num_classes)
        
        return logits
