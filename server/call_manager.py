from typing import Dict, Optional
import threading

import numpy as np

from detector.streaming import StreamingDetector
from server.risk_engine import CallContext

class CallState:
    def __init__(self):
        self.detector = StreamingDetector()
        self.context = CallContext()
        self.peak_risk = 0.0
        self.windows_processed = 0
        self.start_time = __import__('time').time()
        # Ensures only ONE alert is dispatched per call session (on first HIGH window).
        self.incident_generated: bool = False
        # Collects every HIGH-risk window dict during the call.
        # Written to the incident report at call disconnect so
        # evidence_windows_count is accurate (Fix M2).
        self.high_risk_events: list = []
        # Voiceprint: first-window speaker embedding used as baseline.
        # Subsequent windows are compared via cosine similarity to detect
        # mid-call speaker changes (Fix M3 — wire ECAPA-TDNN to risk).
        self.baseline_embedding: Optional[np.ndarray] = None

class CallManager:
    """
    Thread-safe registry mapping call_id to its business logic state (detector & context).
    Decoupled from WebSockets to allow any transport or background worker to access it.
    """
    def __init__(self):
        self.active_calls: Dict[str, CallState] = {}
        self._lock = threading.Lock()
        
    def add_call(self, call_id: str) -> CallState:
        with self._lock:
            state = CallState()
            self.active_calls[call_id] = state
            return state
            
    def remove_call(self, call_id: str):
        with self._lock:
            self.active_calls.pop(call_id, None)
            
    def get_state(self, call_id: str) -> Optional[CallState]:
        with self._lock:
            return self.active_calls.get(call_id)
            
    def get_all_calls(self) -> Dict[str, CallState]:
        with self._lock:
            # Return a shallow copy of the dictionary to avoid iteration errors
            return dict(self.active_calls)

call_manager = CallManager()
