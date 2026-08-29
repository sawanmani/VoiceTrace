"""
VoiceTrace — server/incident_report.py (F7)

Auto-generates a JSON incident report when a call crosses the high-risk threshold.
This converts a transient dashboard alert into an auditable compliance artifact
ready for bank fraud teams.
"""

import json
import logging
from pathlib import Path
from datetime import datetime

log = logging.getLogger("voicetrace.incident")

async def generate_incident_report(call_id: str, events: list):
    """
    Generates a structured incident report for a flagged call.
    Saves to the 'incidents/' directory.
    """
    if not events:
        log.warning("generate_incident_report called with empty events for call %s", call_id)
        return None

    incident_dir = Path("incidents")
    incident_dir.mkdir(exist_ok=True)

    peak_event = max(events, key=lambda x: x["risk_score"])

    # Sanitize call_id for Windows filesystem (strip illegal chars)
    safe_call_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in call_id)

    report = {
        "incident_id": f"INC-{safe_call_id}-{int(datetime.now().timestamp())}",
        "call_id": call_id,
        "timestamp": datetime.now().isoformat(),
        "peak_risk_score": peak_event["risk_score"],
        "band": peak_event["band"],
        "recommendation": peak_event["recommendation"],
        "sub_signals": peak_event["signals"],
        "evidence_windows_count": len(events),
        "status": "OPEN",
        "human_review_required": True
    }

    out_path = incident_dir / f"{report['incident_id']}.json"
    import aiofiles
    async with aiofiles.open(out_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(report, indent=2))

    log.info("Incident report generated: %s", out_path)
    return out_path
