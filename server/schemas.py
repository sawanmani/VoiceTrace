from pydantic import BaseModel
from typing import Dict, List, Literal, Optional

class HealthResponse(BaseModel):
    status: str
    active_calls: int
    dashboard_subscribers: int
    model: str

class RiskEventSchema(BaseModel):
    """
    Data contract for a scored risk event.
    Matches the schema outlined in ARCHITECTURE.md.
    """
    risk_score: int
    band: Literal["low", "medium", "high", "uncertain"]
    signals: Dict[str, float]
    caller_identity_match_score: Optional[float] = None
    recommendation: str
    call_id: str
    window_index: int
    latency_ms: float
    timestamp: float

class AnalyzeResponse(BaseModel):
    call_id: str
    windows: List[RiskEventSchema]

class ContextUpdateMessage(BaseModel):
    type: Literal["context", "trigger_challenge"]
    caller_familiarity: Optional[float] = None
    transaction_risk: Optional[float] = None

class ChallengeAudioMessage(BaseModel):
    type: Literal["challenge_audio"]
    audio_b64: str
    prompt: str

class FeedbackRequest(BaseModel):
    call_id: str
    label: Literal["genuine", "spoof"]
