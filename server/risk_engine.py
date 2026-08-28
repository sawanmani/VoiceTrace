"""
VoiceTrace — server/risk_engine.py

Combines the raw AASIST-L spoof_prob and liveness_score with optional call
context into one composite 0–100 risk score plus an explainable breakdown.

Design:
  - All weights and thresholds come from config.yaml (NFR-5).
  - Every RiskEvent carries sub-scores, not just a single number (NFR-3).
  - Generating recommendation text here keeps the dashboard dumb — it only
    renders what the server sends (per the ARCHITECTURE.md contract).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Optional

from detector.streaming import DetectionResult
from server.config import (
    RECOMMENDATIONS,
    THRESHOLD_HIGH,
    THRESHOLD_MEDIUM,
    WEIGHTS,
)


# ── Output type ────────────────────────────────────────────────────────────

@dataclass
class RiskEvent:
    """
    Scored event pushed to the dashboard over WebSocket.
    Shape matches the data contract in ARCHITECTURE.md § 3.
    """
    risk_score: int                       # 0–100
    band: str                             # "low" | "medium" | "high"
    signals: Dict[str, float]             # named sub-scores (all 0–1)
    recommendation: str
    call_id: str
    window_index: int
    latency_ms: float
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "risk_score": self.risk_score,
            "band": self.band,
            "signals": self.signals,
            "recommendation": self.recommendation,
            "call_id": self.call_id,
            "window_index": self.window_index,
            "latency_ms": round(self.latency_ms, 1),
            "timestamp": self.timestamp,
        }


# ── Call context ───────────────────────────────────────────────────────────

@dataclass
class CallContext:
    """
    Optional contextual signals that shift the composite score.
    Defaults represent a neutral / unknown call context.
    """
    caller_familiarity: float = 0.5   # 0 = unknown, 1 = verified known contact
    transaction_risk: float = 0.5     # 0 = no action, 1 = high-value transfer


# ── Risk Engine ────────────────────────────────────────────────────────────

class RiskEngine:
    """
    Computes a composite risk score from detector output + call context.

    Score formula (weights from config.yaml):
        composite = (
            w_spoof    * smoothed_spoof_prob
          + w_liveness * (1 - liveness_score)   ← high liveness = lower risk
          + w_caller   * (1 - caller_familiarity)
          + w_txn      * transaction_risk
        )

    Scaled to 0–100 for dashboard display.
    """

    def score(
        self,
        detection: DetectionResult,
        call_id: str,
        context: Optional[CallContext] = None,
    ) -> RiskEvent:
        """
        Produce a RiskEvent from a DetectionResult.

        Args:
            detection: Output of StreamingDetector._score_window().
            call_id:   Identifier for the current call session.
            context:   Optional call context; uses neutral defaults if None.
        Returns:
            RiskEvent ready to serialise and push over WebSocket.
        """
        if context is None:
            context = CallContext()

        w = WEIGHTS
        composite = (
            w["spoof_prob"]          * detection.smoothed_spoof_prob
            + w["liveness"]          * (1.0 - detection.liveness_score)
            + w["caller_context"]    * (1.0 - context.caller_familiarity)
            + w["transaction_context"] * context.transaction_risk
        )

        # Clamp to [0, 1] and scale to 0–100
        composite = float(max(0.0, min(1.0, composite)))
        risk_score = int(round(composite * 100))

        # Determine band
        if risk_score >= THRESHOLD_HIGH:
            band = "high"
        elif risk_score >= THRESHOLD_MEDIUM:
            band = "medium"
        else:
            band = "low"

        # Build signals dict — merge model sub-scores with context signals
        signals = {
            **detection.signals,
            "liveness_score": round(detection.liveness_score, 4),
            "caller_context_score": round(1.0 - context.caller_familiarity, 4),
            "transaction_context_score": round(context.transaction_risk, 4),
        }

        recommendation = RECOMMENDATIONS[band]

        return RiskEvent(
            risk_score=risk_score,
            band=band,
            signals=signals,
            recommendation=recommendation,
            call_id=call_id,
            window_index=detection.window_index,
            latency_ms=detection.latency_ms,
        )
