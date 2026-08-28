"""
VoiceTrace — server/pubsub.py  (FIX 2: Horizontal Scaling)

Thin abstraction over a broadcast channel.
- In single-process dev mode: in-process asyncio.Queue fan-out (zero dependencies).
- In multi-worker / K8s mode: swap this for Redis Pub/Sub by setting REDIS_URL env var.

This ensures ConnectionManager never cares how many workers are running.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Callable, Dict, Set

log = logging.getLogger("voicetrace.pubsub")

# ── In-process fallback (default) ──────────────────────────────────────────

class _LocalBroker:
    """Pure asyncio pub/sub used when REDIS_URL is not set."""

    def __init__(self) -> None:
        # channel → set of async callables
        self._listeners: Dict[str, Set[Callable]] = {}

    def subscribe(self, channel: str, callback: Callable) -> None:
        self._listeners.setdefault(channel, set()).add(callback)

    def unsubscribe(self, channel: str, callback: Callable) -> None:
        self._listeners.get(channel, set()).discard(callback)

    async def publish(self, channel: str, payload: dict) -> None:
        msg = json.dumps(payload)
        for cb in list(self._listeners.get(channel, set())):
            try:
                await cb(msg)
            except Exception as e:
                log.debug("pubsub callback error on %s: %s", channel, e)


# ── Redis Pub/Sub (enabled when REDIS_URL is set) ──────────────────────────

class _RedisBroker:
    """
    Redis-backed broker for multi-process / multi-node deployments.
    Requires `pip install redis[asyncio]`.
    """

    def __init__(self, url: str) -> None:
        import redis.asyncio as aioredis  # noqa: PLC0415
        self._redis = aioredis.from_url(url)
        self._listeners: Dict[str, Set[Callable]] = {}
        self._started = False

    def subscribe(self, channel: str, callback: Callable) -> None:
        self._listeners.setdefault(channel, set()).add(callback)

    def unsubscribe(self, channel: str, callback: Callable) -> None:
        self._listeners.get(channel, set()).discard(callback)

    async def publish(self, channel: str, payload: dict) -> None:
        await self._redis.publish(f"voicetrace:{channel}", json.dumps(payload))

    async def _listen_loop(self) -> None:
        pubsub = self._redis.pubsub()
        await pubsub.psubscribe("voicetrace:*")
        async for message in pubsub.listen():
            if message["type"] != "pmessage":
                continue
            channel = message["channel"].decode().removeprefix("voicetrace:")
            payload = message["data"]
            for cb in list(self._listeners.get(channel, set())):
                try:
                    await cb(payload)
                except Exception as e:
                    log.debug("Redis listener callback error: %s", e)

    async def start(self) -> None:
        if not self._started:
            asyncio.create_task(self._listen_loop())
            self._started = True


# ── Factory ────────────────────────────────────────────────────────────────

def create_broker():
    redis_url = os.getenv("REDIS_URL", "")
    if redis_url:
        log.info("PubSub: Redis mode  url=%s", redis_url)
        return _RedisBroker(redis_url)
    log.info("PubSub: in-process mode (set REDIS_URL for multi-worker)")
    return _LocalBroker()


broker = create_broker()
