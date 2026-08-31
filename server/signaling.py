"""
VoiceTrace — server/signaling.py

WebRTC signaling relay for 1:1 in-app calls.

Design:
  - The server is a DUMB relay: it forwards raw JSON frames from peer A to
    peer B within a room. It never inspects or modifies SDP offer/answer or
    ICE candidates.
  - A room holds exactly two peers (max_peers=2). A third connection attempt
    is rejected with code 1008 (policy violation).
  - No audio data flows through this channel. Audio side-channel detection
    uses the existing /ws/call/{call_id} endpoint independently.
  - No API key is required on this endpoint: it carries no audio, PII, or
    inference data — only opaque WebRTC handshake payloads.

Supported message types relayed (JSON, opaque to server):
  {"type": "offer",         "sdp": "..."}
  {"type": "answer",        "sdp": "..."}
  {"type": "ice-candidate", "candidate": {...}}
  {"type": "hangup"}
  {"type": "ready"}   — sent by server back to both peers when room is full
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import WebSocket

log = logging.getLogger("voicetrace.signaling")


# ── Room ───────────────────────────────────────────────────────────────────

@dataclass
class SignalingRoom:
    """State for a single signaling room (max 2 peers)."""
    room_id: str
    peers: List[WebSocket] = field(default_factory=list)
    MAX_PEERS: int = 2

    def is_full(self) -> bool:
        return len(self.peers) >= self.MAX_PEERS

    def other(self, ws: WebSocket) -> Optional[WebSocket]:
        """Return the other peer's WebSocket, or None if room has only 1 peer."""
        for p in self.peers:
            if p is not ws:
                return p
        return None


# ── Manager ────────────────────────────────────────────────────────────────

class SignalingManager:
    """
    Registry of active signaling rooms.

    Thread-safety: we operate inside asyncio's single event loop, so no
    explicit lock is needed for the dict — all mutations happen in coroutines
    that are never interleaved within a single await boundary.
    """

    def __init__(self) -> None:
        self._rooms: Dict[str, SignalingRoom] = {}

    def _get_or_create(self, room_id: str) -> SignalingRoom:
        if room_id not in self._rooms:
            self._rooms[room_id] = SignalingRoom(room_id=room_id)
        return self._rooms[room_id]

    async def join(self, room_id: str, ws: WebSocket) -> bool:
        """
        Add ws to room. Returns True if joined, False if room is full.
        When a second peer joins, sends {"type":"ready"} to BOTH peers so
        the caller-side knows it can begin the WebRTC offer.
        """
        room = self._get_or_create(room_id)
        if room.is_full():
            log.warning("signaling  room=%s  rejected (full)", room_id)
            return False

        room.peers.append(ws)
        log.info("signaling  room=%s  peer_count=%d  joined", room_id, len(room.peers))

        if len(room.peers) == 2:
            # Both peers present — tell them to start the WebRTC handshake.
            # Peer index 0 = "caller" (sends offer), peer index 1 = "callee" (sends answer).
            await self._send(room.peers[0], {"type": "ready", "role": "caller"})
            await self._send(room.peers[1], {"type": "ready", "role": "callee"})
            log.info("signaling  room=%s  both peers ready, handshake can begin", room_id)

        return True

    async def relay(self, room_id: str, sender: WebSocket, message: str) -> None:
        """Forward a raw JSON string from sender to the other peer in the room."""
        room = self._rooms.get(room_id)
        if room is None:
            return
        recipient = room.other(sender)
        if recipient is None:
            return  # other peer hasn't joined yet — drop (client should queue locally)
        await self._send(recipient, message, raw=True)

    async def leave(self, room_id: str, ws: WebSocket) -> None:
        """Remove ws from room. Notifies remaining peer with hangup signal."""
        room = self._rooms.get(room_id)
        if room is None:
            return

        room.peers = [p for p in room.peers if p is not ws]
        log.info("signaling  room=%s  peer_count=%d  left", room_id, len(room.peers))

        # Notify remaining peer so it can tear down its RTCPeerConnection
        if room.peers:
            await self._send(room.peers[0], {"type": "hangup", "reason": "peer_left"})

        # Clean up empty rooms to prevent memory leak
        if not room.peers:
            del self._rooms[room_id]
            log.info("signaling  room=%s  destroyed (empty)", room_id)

    def room_exists(self, room_id: str) -> bool:
        return room_id in self._rooms

    def peer_count(self, room_id: str) -> int:
        room = self._rooms.get(room_id)
        return len(room.peers) if room else 0

    # ── Helpers ────────────────────────────────────────────────────────────

    @staticmethod
    async def _send(ws: WebSocket, payload, raw: bool = False) -> None:
        """Send a JSON payload to a WebSocket, silently swallowing send errors."""
        try:
            if raw:
                await ws.send_text(payload)
            else:
                await ws.send_text(json.dumps(payload))
        except Exception as exc:
            log.debug("signaling  send failed: %s", exc)


# Singleton used by main.py
signaling_manager = SignalingManager()
