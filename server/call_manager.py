from typing import Dict, Optional
import threading

from detector.streaming import StreamingDetector
from server.risk_engine import CallContext

class CallState:
    def __init__(self):
        self.detector = StreamingDetector()
        self.context = CallContext()
        self.peak_risk = 0.0
        self.windows_processed = 0
        self.start_time = __import__('time').time()
        # Ensures only ONE incident report is generated per call session,
        # even if the call stays at "high" risk for many windows.
        self.incident_generated: bool = False

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
