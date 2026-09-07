"""
VoiceTrace — server/call_lifecycle.py

Shared call finalization logic used by connection_manager (WebSocket transport)
and audiosocket_server (TCP transport).

Previously this logic was copy-pasted in both files (DRY violation).
Centralising here ensures timestamp format, incident report, and DB writes
are consistent regardless of transport.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from server.call_manager import CallState

log = logging.getLogger("voicetrace.lifecycle")


async def finalize_call(call_id: str, state: "CallState") -> None:
    """
    Persist a completed call summary to SQLite and write the incident report
    (if any HIGH-risk windows were seen during the call).

    Called from:
      - connection_manager.disconnect_call()  (WebSocket / Twilio)
      - audiosocket_server._handle_connection() finally block  (Asterisk TCP)

    Args:
        call_id: The call identifier (e.g. "twilio-abc12345").
        state:   The CallState object holding peak_risk, windows_processed,
                 start_time, and high_risk_events.
    """
    from server.risk_engine import band_from_score
    from server.history_db import save_call

    duration_sec = int(time.time() - state.start_time)
    peak = state.peak_risk
    band = band_from_score(int(peak))

    call_data = {
        "call_id": call_id,
        # Full ISO-8601 timestamp — no longer just HH:MM:SS (Fix M5)
        "time": datetime.now().isoformat(timespec="seconds"),
        "peak_risk": peak,
        "band": band,
        "windows": state.windows_processed,
        "duration_sec": duration_sec,
        "completed": True,
    }

    # Write incident report with ALL collected HIGH-risk evidence (Fix M2).
    # high_risk_events is populated in batch_worker.py for every HIGH window.
    # Writing here at call-end gives an accurate evidence_windows_count.
    if state.high_risk_events:
        from server.incident_report import generate_incident_report
        asyncio.create_task(
            generate_incident_report(call_id, list(state.high_risk_events))
        )

    asyncio.create_task(save_call(call_data))

    log.info(
        "Call finalized  call=%s  duration=%ds  peak=%.0f  band=%s  windows=%d",
        call_id, duration_sec, peak, band, state.windows_processed,
    )
