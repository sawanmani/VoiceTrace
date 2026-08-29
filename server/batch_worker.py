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

log = logging.getLogger("voicetrace")

# Shared risk engine instance for scoring
risk_engine = RiskEngine()

async def batch_inference_worker():
    """
    Background worker that dynamically batches ready windows from all active calls.
    Runs periodically to drain buffers.
    """
    log.info("Batch worker starting...")
    
    # Needs to get the model.
    from server._model_cache import get_aasist
    model = get_aasist()
    
    while model is None:
        await asyncio.sleep(1.0)
        model = get_aasist()
        
    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info(f"Batch worker loaded model on {device}")
    
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
        
        with torch.no_grad():
            last_hidden, logits = model(x)
            
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
            
            detection_result = detector.update_ema_and_format(
                raw_spoof_prob=raw_prob,
                liveness_score=liveness,
                signals=signals,
                latency_ms=latency_ms
            )
            
            risk_event = risk_engine.score(detection_result, call_id, state.context)
            
            from server.config import LOG_SCORES
            if LOG_SCORES:
                log.info(
                    "process  call=%s  window=%d  risk=%d  band=%s  latency=%.1fms",
                    call_id, risk_event.window_index, risk_event.risk_score,
                    risk_event.band, risk_event.latency_ms,
                )
            
            if risk_event.band == "high":
                from server.incident_report import generate_incident_report
                # Fire and forget incident generation
                asyncio.create_task(generate_incident_report(call_id, [risk_event.to_dict()]))
                
            asyncio.create_task(manager.broadcast(call_id, risk_event.to_dict()))
