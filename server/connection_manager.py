from typing import Dict, List, Set
from collections import defaultdict
from fastapi import WebSocket
import asyncio
import json
import logging

from detector.streaming import StreamingDetector
from server.pubsub import broker
from server.config import MAX_CALLS

log = logging.getLogger("voicetrace")

class ConnectionManager:
    """
    Manages active WebSocket connections and call state.
    Fully decoupled from FastAPI routes for testability.
    """
    def __init__(self, max_calls: int = 50):
        self.max_calls = max_calls
        # Per-call detector instances: call_id -> StreamingDetector
        self.detectors: Dict[str, StreamingDetector] = {}
        
        # Dashboard subscribers: call_id -> set of WebSocket connections
        self.subscribers: Dict[str, Set[WebSocket]] = defaultdict(set)
        
        # Global subscriber (catches all calls) — used by dashboard /ws/score
        self.global_subscribers: Set[WebSocket] = set()

        # Wire pubsub callbacks so this manager receives cross-worker events
        broker.subscribe("_global", self._handle_pubsub_event)

    async def _handle_pubsub_event(self, raw: str) -> None:
        """Dispatch an event received from pubsub to all local subscribers."""
        payload = json.loads(raw)
        call_id = payload.get("call_id", "")
        dead: List[WebSocket] = []
        for ws in list(self.subscribers.get(call_id, set())):
            try:
                await ws.send_text(raw)
            except Exception:
                dead.append(ws)
        for ws in list(self.global_subscribers):
            try:
                await ws.send_text(raw)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.subscribers[call_id].discard(ws)
            self.global_subscribers.discard(ws)

    async def connect_call(self, call_id: str, websocket: WebSocket) -> StreamingDetector:
        active = await broker.get_active_calls()
        if active >= self.max_calls:
            await websocket.close(code=1008, reason="Server at capacity — too many active calls")
            raise RuntimeError(f"MAX_CALLS ({self.max_calls}) reached, connection rejected")
        await websocket.accept()
        detector = StreamingDetector()
        self.detectors[call_id] = detector
        self.subscribers[call_id].add(websocket)
        await broker.increment_active_calls()
        return detector

    async def disconnect_call(self, call_id: str, websocket: WebSocket):
        self.subscribers[call_id].discard(websocket)
        detector = self.detectors.pop(call_id, None)
        if detector:
            detector.reset()
            await broker.decrement_active_calls()

    async def connect_global(self, websocket: WebSocket):
        await websocket.accept()
        self.global_subscribers.add(websocket)

    def disconnect_global(self, websocket: WebSocket):
        self.global_subscribers.discard(websocket)

    async def broadcast(self, call_id: str, event_dict: dict) -> None:
        """Publish to pubsub broker — works across processes when Redis is configured."""
        await broker.publish(call_id, event_dict)
        # Also publish to global channel so cross-worker dashboard listeners receive it
        await broker.publish("_global", event_dict)

manager = ConnectionManager(max_calls=MAX_CALLS)
