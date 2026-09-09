"""
VoiceTrace — server/_model_cache.py  (FIX 3: Startup Warmup)

Central, lazily-evaluated model registry.
Models are FORCE-LOADED at FastAPI startup (main.py lifespan hook).
After that, every get_*() call is a dict lookup — zero I/O, zero latency.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

# Suppress HuggingFace Hub symlink warning on Windows (no admin rights needed)
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

log = logging.getLogger("voicetrace.models")

_registry: dict = {}


def get_aasist() -> Optional[object]:
    return _registry.get("aasist")

def get_transformer() -> Optional[object]:
    return _registry.get("transformer")

def get_asr_model() -> Optional[object]:
    return _registry.get("asr")

def get_spk_model() -> Optional[object]:
    return _registry.get("spk")


def warmup_all() -> None:
    """
    Called ONCE during FastAPI startup.
    Loads every heavy model so the first WebSocket call never blocks.
    """
    import torch

    # 1. AASIST-L
    try:
        from detector.inference import load_model, DEFAULT_CHECKPOINT
        model = load_model(DEFAULT_CHECKPOINT, device="cuda" if torch.cuda.is_available() else "cpu")
        model.eval()
        _registry["aasist"] = model
        log.info("Warmed up AASIST-L ✓")
    except Exception as e:
        log.error("Failed to warm up AASIST-L: %s", e)

    # 1.5 VoiceTransformer (New Architecture)
    try:
        from detector.transformer_model import VoiceTransformer
        import os
        transformer_weights = "models/weights/voicetransformer_epoch50.pth"
        if os.path.exists(transformer_weights):
            t_model = VoiceTransformer(num_classes=4).to("cuda" if torch.cuda.is_available() else "cpu")
            t_model.load_state_dict(torch.load(transformer_weights, map_location="cuda" if torch.cuda.is_available() else "cpu", weights_only=True))
            t_model.eval()
            _registry["transformer"] = t_model
            log.info("Warmed up VoiceTransformer ✓")
        else:
            log.info("VoiceTransformer weights not found, using AASIST-L as fallback.")
    except Exception as e:
        log.error("Failed to warm up VoiceTransformer: %s", e)

    # 2. SpeechBrain ASR (CRDNN)
    try:
        from speechbrain.inference.ASR import EncoderDecoderASR
        asr = EncoderDecoderASR.from_hparams(
            source="speechbrain/asr-crdnn-rnnlm-librispeech",
            savedir="models/asr_cache",
            run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"},
        )
        _registry["asr"] = asr
        log.info("Warmed up SpeechBrain ASR ✓")
    except Exception as e:
        # Windows symlink fallback: use snapshot_download with local_dir_use_symlinks=False
        try:
            from huggingface_hub import snapshot_download
            local_dir = snapshot_download(
                repo_id="speechbrain/asr-crdnn-rnnlm-librispeech",
                local_dir="models/asr_cache",
                local_dir_use_symlinks=False,
            )
            from speechbrain.inference.ASR import EncoderDecoderASR
            asr = EncoderDecoderASR.from_hparams(
                source=local_dir,
                run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"},
            )
            _registry["asr"] = asr
            log.info("Warmed up SpeechBrain ASR (no-symlink fallback) ✓")
        except Exception as e2:
            log.warning("ASR model not available (challenge verification degraded): %s", e2)

    # 3. ECAPA-TDNN speaker embedder
    try:
        from speechbrain.inference.speaker import EncoderClassifier
        spk = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir="models/spk_cache",
            run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"},
        )
        _registry["spk"] = spk
        log.info("Warmed up ECAPA-TDNN speaker model ✓")
    except Exception as e:
        # On Windows without Developer Mode, HuggingFace Hub can't create symlinks.
        # Fall back to downloading directly into the local cache dir.
        try:
            from huggingface_hub import snapshot_download
            local_dir = snapshot_download(
                repo_id="speechbrain/spkrec-ecapa-voxceleb",
                local_dir="models/spk_cache",
                local_dir_use_symlinks=False,  # copies files instead of symlinks
            )
            from speechbrain.inference.speaker import EncoderClassifier
            spk = EncoderClassifier.from_hparams(
                source=local_dir,
                run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"},
            )
            _registry["spk"] = spk
            log.info("Warmed up ECAPA-TDNN speaker model (no-symlink fallback) ✓")
        except Exception as e2:
            log.warning("Speaker model not available (voiceprint disabled): %s", e2)
