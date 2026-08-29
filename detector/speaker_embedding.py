"""
VoiceTrace — detector/speaker_embedding.py  (FIX 5: DB-backed voiceprints)

Per-user voiceprint enrollment and verification.
Uses SQLite via server/voiceprint_db.py so multiple users can be enrolled
simultaneously without overwriting each other.
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import torch
import torch.nn.functional as F

log = logging.getLogger("voicetrace.speaker")


def _get_spk_model():
    from server._model_cache import get_spk_model  # noqa: PLC0415
    return get_spk_model()


class SpeakerVerifier:
    """
    Stateless helper — all state lives in the SQLite DB via voiceprint_db.py.
    Each method receives an explicit user_id so multiple users can be active
    at the same time without race conditions.
    """

    async def enroll(self, user_id: str, audio_pcm: np.ndarray) -> None:
        """
        Extract speaker embedding from audio and persist it for `user_id`.
        """
        model = _get_spk_model()
        if model is None:
            log.warning("Speaker model not loaded — enroll is a no-op")
            return

        tensor = torch.FloatTensor(audio_pcm).unsqueeze(0)
        with torch.no_grad():
            device = next(model.mods.parameters()).device
            tensor = tensor.to(device)
            emb = model.encode_batch(tensor).squeeze(0).cpu().numpy()

        from server.voiceprint_db import save_embedding  # noqa: PLC0415
        await save_embedding(user_id, emb)
        log.info("Enrolled voiceprint for user_id=%s", user_id)

    async def verify(self, user_id: str, audio_pcm: np.ndarray) -> float:
        """
        Compare live audio to enrolled embedding.
        Returns cosine similarity [-1.0, 1.0].
        """
        from server.voiceprint_db import load_embedding  # noqa: PLC0415
        enrolled_np = await load_embedding(user_id)

        if enrolled_np is None:
            log.debug("No voiceprint enrolled for user_id=%s — skipping verification", user_id)
            return 1.0

        model = _get_spk_model()
        if model is None:
            return 1.0

        tensor = torch.FloatTensor(audio_pcm).unsqueeze(0)
        with torch.no_grad():
            device = next(model.mods.parameters()).device
            tensor = tensor.to(device)
            live_emb = model.encode_batch(tensor).squeeze(0).cpu()

        enrolled_tensor = torch.FloatTensor(enrolled_np)
        sim = F.cosine_similarity(enrolled_tensor, live_emb, dim=0).item()
        # Map [-1, 1] → [0, 1]
        return (sim + 1.0) / 2.0
