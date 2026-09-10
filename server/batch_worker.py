import asyncio
import logging
import time

import numpy as np
import torch

from detector.inference import pad_or_trim
from detector.streaming import _extract_signals, NB_SAMP
from server.call_manager import call_manager
from server.risk_engine import RiskEngine
from server.connection_manager import manager
from server.config import LOG_SCORES, RETAIN_AUDIO
from server.history_db import log_event

log = logging.getLogger("voicetrace")


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D embeddings. Returns 0–1."""
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm < 1e-9:
        return 0.0
    return float(np.clip(dot / norm, 0.0, 1.0))

# Privacy invariant: raw audio must NEVER be persisted to disk.
# DPDP Act 2023 §4(1)(b) — collect only what is necessary.
# This assertion fires at worker startup if config is misconfigured.
assert not RETAIN_AUDIO, (
    "RETAIN_AUDIO=true detected in config.yaml. "
    "Raw voice audio is biometric data. "
    "This flag must remain false per DPDP Act data-minimization requirements. "
    "If you need audio for research, obtain explicit informed consent first."
)

# Shared risk engine instance for scoring
risk_engine = RiskEngine()

async def batch_inference_worker():
    """
    Background worker that dynamically batches ready windows from all active calls.
    Runs periodically to drain buffers.
    """
    log.info("Batch worker starting...")
    
    # Needs to get the model.
    from server._model_cache import get_aasist, get_transformer
    transformer_model = get_transformer()
    aasist_model = get_aasist()
    
    # Wait for at least one model to load
    retry_count = 0
    max_retries = 30
    while transformer_model is None and aasist_model is None:
        if retry_count >= max_retries:
            log.error(f"Failed to load detection models after {max_retries} retries. Shutting down.")
            raise RuntimeError("Model initialization failed")
        await asyncio.sleep(1.0)
        transformer_model = get_transformer()
        aasist_model = get_aasist()
        retry_count += 1
        if retry_count % 5 == 0:
            log.warning(f"Model load in progress... ({retry_count}s elapsed)")
        
    device = "cpu"
    if transformer_model:
        log.info(f"Batch worker loaded VoiceTransformer on {device}")
        active_model = transformer_model
        is_transformer = True
    else:
        log.info(f"Batch worker loaded AASIST-L on {device}")
        active_model = aasist_model
        is_transformer = False
    
    while True:
        await asyncio.sleep(0.1) # Poll every 100ms
        
        active_calls = call_manager.get_all_calls()
        if not active_calls:
            continue
            
        ready_batch = []
        call_ids = []
        liveness_scores = []
        
        for call_id, state in active_calls.items():
            detector = state.detector
            window = detector.get_ready_window()
            if window is not None:
                # 1. Liveness heuristics run immediately per window
                liveness_result = detector._liveness.check(window)
                liveness_scores.append(liveness_result.liveness_score)
                
                # 2. Prepare audio for model
                audio_fixed = pad_or_trim(window, NB_SAMP)
                ready_batch.append(audio_fixed)
                call_ids.append(call_id)
                
        if not ready_batch:
            continue
            
        t0 = time.perf_counter()
        
        # 3. Stack into batch tensor
        batch_array = np.stack(ready_batch) # Shape: (B, 64600)
        x = torch.FloatTensor(batch_array).to(device) # Shape: (B, 64600)
        
        def _forward_pass(mod, inputs):
            with torch.no_grad():
                return mod(inputs)
                
        loop = asyncio.get_running_loop()
        
        if is_transformer:
            logits = await loop.run_in_executor(None, _forward_pass, active_model, x)
            probs = torch.softmax(logits, dim=1)
            # Transformer classes: 0: Genuine, 1: ASVspoof, 2: WaveFake, 3: InTheWild
            # Spoof probability is the sum of classes 1, 2, and 3
            raw_spoof_probs = probs[:, 1:].sum(dim=1).cpu().numpy()
            
            # Transformer does not produce the same intermediate features
            # Pass a dummy tensor so `_extract_signals` doesn't crash, or handle it properly.
            last_hidden = torch.zeros(x.size(0), 160)
        else:
            last_hidden, logits = await loop.run_in_executor(None, _forward_pass, active_model, x)
            probs = torch.softmax(logits, dim=1)
            raw_spoof_probs = probs[:, 1].cpu().numpy()
            
        latency_ms = (time.perf_counter() - t0) * 1000
        
        # 4. Scatter results and broadcast
        for i, call_id in enumerate(call_ids):
            state = call_manager.get_state(call_id)
            if not state:
                continue # Call disconnected while processing
                
            detector = state.detector
            raw_prob = float(raw_spoof_probs[i])
            liveness = liveness_scores[i]
            
            # extract_signals expects a 1D tensor of shape (160,) - we slice it to keep shape (1, 160)
            # Actually, `_extract_signals` does `h = last_hidden.squeeze(0)` which assumes shape (1, 160).
            # To be safe for batch > 1, we pass a tensor of shape (1, 160)
            signals = _extract_signals(last_hidden[i:i+1])
            
            if is_transformer:
                c_probs = {
                    "Genuine": float(probs[i, 0].cpu().numpy()),
                    "ASVspoof": float(probs[i, 1].cpu().numpy()),
                    "WaveFake": float(probs[i, 2].cpu().numpy()),
                    "InTheWild": float(probs[i, 3].cpu().numpy()),
                }
            else:
                c_probs = None
                
            detection_result = detector.update_ema_and_format(
                raw_spoof_prob=raw_prob,
                liveness_score=liveness,
                signals=signals,
                latency_ms=latency_ms,
                class_probs=c_probs
            )
            
            risk_event = risk_engine.score(detection_result, call_id, state.context)

            # ── Voiceprint matching (Fix M3) ─────────────────────────────
            # Extract speaker embedding with ECAPA-TDNN and compare against
            # the first-window baseline to detect mid-call speaker changes.
            try:
                from server._model_cache import get_spk_model
                spk_model = get_spk_model()
                if spk_model is not None:
                    # ECAPA-TDNN expects (batch, samples) at 16kHz
                    spk_input = torch.FloatTensor(ready_batch[i]).unsqueeze(0)
                    with torch.no_grad():
                        embedding = spk_model.encode_batch(spk_input)
                    emb_np = embedding.squeeze().cpu().numpy()

                    if state.baseline_embedding is None:
                        # First window: set baseline ("this is who started the call")
                        state.baseline_embedding = emb_np
                        state.context.caller_identity_match_score = 1.0  # perfect match
                    else:
                        sim = _cosine_similarity(state.baseline_embedding, emb_np)
                        state.context.caller_identity_match_score = sim
                        if LOG_SCORES and sim < 0.7:
                            log.warning(
                                "voiceprint  call=%s  window=%d  similarity=%.3f  "
                                "SPEAKER CHANGE DETECTED",
                                call_id, risk_event.window_index, sim,
                            )
            except Exception as vp_err:
                log.debug("Voiceprint extraction skipped: %s", vp_err)

            # Re-score with updated voiceprint context
            risk_event = risk_engine.score(detection_result, call_id, state.context)

            state.peak_risk = max(state.peak_risk, risk_event.risk_score)
            state.windows_processed += 1
            
            if LOG_SCORES:
                log.info(
                    "process  call=%s  window=%d  risk=%d  band=%s  latency=%.1fms",
                    call_id, risk_event.window_index, risk_event.risk_score,
                    risk_event.band, risk_event.latency_ms,
                )
            
            # ── Audit pipeline ────────────────────────────────────────────
            #
            # HIGH-risk handling (Fix M2):
            #   - Collect EVERY HIGH window in state.high_risk_events so the
            #     incident report (written at call disconnect) has an accurate
            #     evidence_windows_count.
            #   - Alert fires on the FIRST HIGH window only (dedup via flag).
            #   - Incident report is written at call disconnect in
            #     call_lifecycle.finalize_call() — NOT here.
            if risk_event.band == "high":
                state.high_risk_events.append(risk_event.to_dict())
                if not state.incident_generated:
                    state.incident_generated = True
                    # Alert fires immediately so operators get real-time notification
                    from server.alert_dispatcher import dispatch_alert
                    asyncio.create_task(dispatch_alert(call_id, risk_event.to_dict()))

            asyncio.create_task(log_event(call_id, risk_event.to_dict()))
            asyncio.create_task(manager.broadcast(call_id, risk_event.to_dict()))


