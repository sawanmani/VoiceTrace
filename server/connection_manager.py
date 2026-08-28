from typing import Dict, List, Set
from collections import defaultdict
from fastapi import WebSocket
import json
import logging

from detector.streaming import StreamingDetector

log = logging.getLogger("voicetrace")

class ConnectionManager:
    """
    Manages active WebSocket connections and call state.
    Fully decoupled from FastAPI routes for testability.
    """
    def __init__(self):
        # Per-call detector instances: call_id -> StreamingDetector
        self.detectors: Dict[str, StreamingDetector] = {}
        
        # Dashboard subscribers: call_id -> set of WebSocket connections
        self.subscribers: Dict[str, Set[WebSocket]] = defaultdict(set)
        
        # Global subscriber (catches all calls) — used by dashboard /ws/score
        self.global_subscribers: Set[WebSocket] = set()

    async def connect_call(self, call_id: str, websocket: WebSocket) -> StreamingDetector:
        await websocket.accept()
        detector = StreamingDetector()
        self.detectors[call_id] = detector
        self.subscribers[call_id].add(websocket)
        return detector

    def disconnect_call(self, call_id: str, websocket: WebSocket):
        self.subscribers[call_id].discard(websocket)
        detector = self.detectors.pop(call_id, None)
        if detector:
            detector.reset()

    async def connect_global(self, websocket: WebSocket):
        await websocket.accept()
        self.global_subscribers.add(websocket)

    def disconnect_global(self, websocket: WebSocket):
        self.global_subscribers.discard(websocket)

    async def broadcast(self, call_id: str, event_dict: dict):
        """Push an event dict to all subscribers of this call_id and global listeners."""
        payload = json.dumps(event_dict)
        dead: List[WebSocket] = []

        # Per-call subscribers
        for ws in list(self.subscribers.get(call_id, set())):
            try:
                await ws.send_text(payload)
            except Exception as e:
                log.debug(f"Subscriber {call_id} send failed: {e}")
                dead.append(ws)

        # Global subscribers
        for ws in list(self.global_subscribers):
            try:
                await ws.send_text(payload)
            except Exception as e:
                log.debug(f"Global subscriber send failed: {e}")
                dead.append(ws)

        # Clean up dead connections
        for ws in dead:
            self.subscribers[call_id].discard(ws)
            self.global_subscribers.discard(ws)

manager = ConnectionManager()
