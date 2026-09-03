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
from server.incident_report import generate_incident_report

log = logging.getLogger("voicetrace")

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
    from server._model_cache import get_aasist
    model = get_aasist()
    
    retry_count = 0
    max_retries = 30
    while model is None:
        if retry_count >= max_retries:
            log.error(f"Failed to load AASIST model after {max_retries} retries. Shutting down.")
            raise RuntimeError("Model initialization failed")
        await asyncio.sleep(1.0)
        model = get_aasist()
        retry_count += 1
        if retry_count % 5 == 0:
            log.warning(f"Model load in progress... ({retry_count}s elapsed)")
        
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
        
        def _forward_pass(mod, inputs):
            with torch.no_grad():
                return mod(inputs)
                
        loop = asyncio.get_running_loop()
        last_hidden, logits = await loop.run_in_executor(None, _forward_pass, model, x)
            
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
            
            
            state.peak_risk = max(state.peak_risk, risk_event.risk_score)
            state.windows_processed += 1
            
            if LOG_SCORES:
                log.info(
                    "process  call=%s  window=%d  risk=%d  band=%s  latency=%.1fms",
                    call_id, risk_event.window_index, risk_event.risk_score,
                    risk_event.band, risk_event.latency_ms,
                )
            
            # Generate ONE incident report per call (dedup via incident_generated flag).
            # Without this guard, a 30s high-risk call would generate ~60 separate files.
            if risk_event.band == "high" and not state.incident_generated:
                state.incident_generated = True
                asyncio.create_task(generate_incident_report(call_id, [risk_event.to_dict()]))
                from server.alert_dispatcher import dispatch_alert
                asyncio.create_task(dispatch_alert(call_id, risk_event.to_dict()))
                
            asyncio.create_task(log_event(call_id, risk_event.to_dict()))
            asyncio.create_task(manager.broadcast(call_id, risk_event.to_dict()))

