"""
VoiceTrace — server/incident_report.py

Auto-generates a JSON incident report when a call crosses the high-risk threshold.
This converts a transient dashboard alert into an auditable compliance artifact
ready for bank fraud teams.

One report is generated per call (deduplication enforced via CallState.incident_generated).
Reports include lifecycle fields (resolved_at, resolved_by) so they can be closed
via the PATCH /incidents/{id}/resolve API endpoint.
"""

import asyncio
import json
import logging
from pathlib import Path
from datetime import datetime, timedelta

import aiofiles

log = logging.getLogger("voicetrace.incident")

# Absolute path — never depends on the process working directory.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_INCIDENT_DIR = _PROJECT_ROOT / "incidents"

# Retention: auto-delete incident files older than this many days (Fix H3-B)
_RETENTION_DAYS = 90


async def generate_incident_report(call_id: str, events: list):
    """
    Generates a structured incident report for a flagged call.
    Saves to the absolute _INCIDENT_DIR path.

    Args:
        call_id: The call identifier (e.g. "twilio-abc12345").
        events:  List of RiskEvent.to_dict() dicts for all HIGH-risk windows.
                 Using all events gives an accurate evidence_windows_count (Fix M2).
    """
    if not events:
        log.warning("generate_incident_report called with empty events for call %s", call_id)
        return None

    _INCIDENT_DIR.mkdir(parents=True, exist_ok=True)

    # Use the window with highest risk_score as the headline event
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
        # evidence_windows_count now reflects ALL HIGH windows seen (Fix M2)
        "evidence_windows_count": len(events),
        "status": "OPEN",
        "human_review_required": True,
        # Lifecycle fields — populated when resolved via PATCH endpoint (Fix H3-C)
        "resolved_at": None,
        "resolved_by": None,
        "resolution_notes": None,
    }

    out_path = _INCIDENT_DIR / f"{report['incident_id']}.json"
    async with aiofiles.open(out_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(report, indent=2))

    log.info("Incident report generated: %s  evidence_windows=%d", out_path, len(events))

    # Kick off retention cleanup asynchronously (Fix H3-B)
    asyncio.create_task(_cleanup_old_incidents())

    return out_path


async def _cleanup_old_incidents(max_age_days: int = _RETENTION_DAYS) -> None:
    """
    Delete incident files older than max_age_days to prevent disk accumulation.
    Called automatically after each new incident is written.
    Timestamp is extracted from the filename: INC-<call_id>-<unix_ts>.json
    """
    if not _INCIDENT_DIR.exists():
        return

    cutoff = datetime.now() - timedelta(days=max_age_days)
    deleted = 0

    for f in _INCIDENT_DIR.glob("*.json"):
        try:
            parts = f.stem.rsplit("-", 1)
            if len(parts) == 2 and parts[1].isdigit():
                file_time = datetime.fromtimestamp(int(parts[1]))
                if file_time < cutoff:
                    f.unlink()
                    deleted += 1
        except Exception as exc:
            log.debug("Retention cleanup skipped %s: %s", f.name, exc)

    if deleted:
        log.info(
            "Incident retention: deleted %d file(s) older than %d days",
            deleted, max_age_days,
        )

