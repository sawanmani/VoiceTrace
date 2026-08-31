from typing import Dict, List, Set
from collections import defaultdict
from fastapi import WebSocket
import asyncio
import json
import logging

from server.pubsub import broker
from server.config import MAX_CALLS
from server.call_manager import call_manager

log = logging.getLogger("voicetrace")

class ConnectionManager:
    """
    Manages active WebSocket connections.
    Decoupled from ML logic.
    """
    def __init__(self, max_calls: int = 50):
        self.max_calls = max_calls
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
        
        # Send to specific call subscribers
        for ws in list(self.subscribers.get(call_id, set())):
            try:
                await ws.send_text(raw)
            except Exception:
                dead.append(ws)
                
        # Send to global subscribers, avoiding duplicates
        for ws in list(self.global_subscribers):
            if ws in self.subscribers.get(call_id, set()):
                continue # Already sent above
            try:
                await ws.send_text(raw)
            except Exception:
                dead.append(ws)
                
        for ws in dead:
            if call_id in self.subscribers:
                self.subscribers[call_id].discard(ws)
            self.global_subscribers.discard(ws)

    async def connect_call(self, call_id: str, websocket: WebSocket):
        active = await broker.get_active_calls()
        if active >= self.max_calls:
            await websocket.close(code=1008, reason="Server at capacity")
            raise RuntimeError(f"MAX_CALLS ({self.max_calls}) reached, connection rejected")
            
        state = call_manager.add_call(call_id)
        self.subscribers[call_id].add(websocket)
        await broker.increment_active_calls()
        return state.detector

    async def disconnect_call(self, call_id: str, websocket: WebSocket):
        self.subscribers[call_id].discard(websocket)
        if not self.subscribers[call_id]:
            del self.subscribers[call_id]
        state = call_manager.get_state(call_id)
        if state:
            import time
            from datetime import datetime
            from server.config import THRESHOLD_HIGH, THRESHOLD_MEDIUM
            from server.history_db import save_call
            
            duration_sec = int(time.time() - state.start_time)
            peak = state.peak_risk
            
            band = "low"
            if peak >= THRESHOLD_HIGH:
                band = "high"
            elif peak >= THRESHOLD_MEDIUM:
                band = "medium"
            elif peak >= (THRESHOLD_MEDIUM / 2):
                band = "uncertain"
                
            call_data = {
                "call_id": call_id,
                "time": datetime.now().strftime("%H:%M:%S"),
                "peak_risk": peak,
                "band": band,
                "windows": state.windows_processed,
                "duration_sec": duration_sec,
                "completed": True
            }
            asyncio.create_task(save_call(call_data))

        call_manager.remove_call(call_id)
        await broker.decrement_active_calls()

    async def connect_global(self, websocket: WebSocket):
        self.global_subscribers.add(websocket)

    def disconnect_global(self, websocket: WebSocket):
        self.global_subscribers.discard(websocket)

    async def broadcast(self, call_id: str, event_dict: dict) -> None:
        """Publish to pubsub broker — works across processes when Redis is configured."""
        # Broadcast once to global channel. Handlers route it locally.
        await broker.publish("_global", event_dict)

manager = ConnectionManager(max_calls=MAX_CALLS)
