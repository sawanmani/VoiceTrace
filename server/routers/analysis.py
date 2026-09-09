import asyncio
import json
import logging
import uuid
import aiofiles

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from server.limiter import limiter
from server.audio_utils import file_bytes_to_pcm
from server.risk_engine import RiskEngine
from server.schemas import AnalyzeResponse, FeedbackRequest
from server.history_db import get_recent_calls, save_feedback

router = APIRouter()
log = logging.getLogger("voicetrace")
risk_engine = RiskEngine()

@router.post("/analyze", response_model=AnalyzeResponse)
@limiter.limit("20/minute")
async def analyze(request: Request, file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        audio = file_bytes_to_pcm(data)
    except Exception as exc:
        log.warning(f"Audio decode failed: {exc}")
        raise HTTPException(status_code=422, detail="Invalid audio format")

    call_id = f"analyze-{uuid.uuid4().hex[:8]}"

    from detector.streaming import StreamingDetector  # noqa: PLC0415
    detector = StreamingDetector()

    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, detector.push_full, audio)

    if not results:
        raise HTTPException(status_code=422, detail="Audio too short — need at least 1 second")

    events = [risk_engine.score(r, call_id).to_dict() for r in results]

    return AnalyzeResponse(call_id=call_id, windows=events)


@router.post("/feedback")
@limiter.limit("60/minute")
async def feedback(request: Request, req: FeedbackRequest):
    """Persist operator feedback label to SQLite for active-learning loop."""
    await save_feedback(req.call_id, req.label)
    log.info("Feedback persisted  call=%s  label=%s", req.call_id, req.label)
    return {"status": "recorded"}


@router.get("/history")
@limiter.limit("30/minute")
async def history(request: Request, limit: int = 50):
    """Return the most recent completed calls from SQLite for dashboard hydration."""
    calls = await get_recent_calls(limit=limit)
    return calls


@router.get("/incidents")
@limiter.limit("30/minute")
async def get_incidents(request: Request):
    """Return all incident reports. Uses aiofiles for non-blocking async reads."""
    from pathlib import Path
    from server.incident_report import _INCIDENT_DIR

    if not _INCIDENT_DIR.exists():
        return []

    incidents = []
    for f in _INCIDENT_DIR.glob("*.json"):
        try:
            async with aiofiles.open(f, "r", encoding="utf-8") as fp:
                content = await fp.read()
                incidents.append(json.loads(content))
        except Exception as e:
            log.warning("Failed to read incident %s: %s", f, e)

    # Sort descending by timestamp
    incidents.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return incidents


class IncidentResolveRequest(BaseModel):
    resolved_by: str
    notes: str = ""

@router.patch("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, req: IncidentResolveRequest):
    """
    Mark an incident report as RESOLVED.

    Updates the JSON file in-place — sets status to RESOLVED and records
    who resolved it and when. Enables closing the audit loop (Fix H3-A).
    """
    from server.incident_report import _INCIDENT_DIR
    from datetime import datetime

    path = _INCIDENT_DIR / f"{incident_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found")

    try:
        async with aiofiles.open(path, "r", encoding="utf-8") as fp:
            report = json.loads(await fp.read())

        report["status"] = "RESOLVED"
        report["resolved_at"] = datetime.now().isoformat()
        report["resolved_by"] = req.resolved_by
        report["resolution_notes"] = req.notes

        async with aiofiles.open(path, "w", encoding="utf-8") as fp:
            await fp.write(json.dumps(report, indent=2))

        log.info("Incident resolved: %s by %s", incident_id, req.resolved_by)
        return {"status": "resolved", "incident_id": incident_id, "resolved_by": req.resolved_by}

    except Exception as e:
        log.error("Failed to resolve incident %s: %s", incident_id, e)
        raise HTTPException(status_code=500, detail="Failed to update incident file")
