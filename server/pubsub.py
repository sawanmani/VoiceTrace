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
        self._active_calls = 0

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

    async def increment_active_calls(self) -> int:
        self._active_calls += 1
        return self._active_calls

    async def decrement_active_calls(self) -> int:
        self._active_calls = max(0, self._active_calls - 1)
        return self._active_calls

    async def get_active_calls(self) -> int:
        return self._active_calls


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
        # Use Redis Streams (XADD) for guaranteed delivery
        await self._redis.xadd(
            f"voicetrace_stream:{channel}", 
            {"data": json.dumps(payload)}, 
            maxlen=1000
        )

    async def _listen_loop(self) -> None:
        # We listen to all active channels we have subscribers for
        last_ids = {}
        while True:
            # We must only read from channels that have active listeners
            channels = list(self._listeners.keys())
            if not channels:
                await asyncio.sleep(0.1)
                continue

            streams = {f"voicetrace_stream:{c}": last_ids.get(c, "$") for c in channels}
            try:
                results = await self._redis.xread(streams, block=100, count=100)
                for stream_name, messages in results:
                    channel = stream_name.decode().removeprefix("voicetrace_stream:")
                    for message_id, message_data in messages:
                        last_ids[channel] = message_id.decode()
                        payload = message_data.get(b"data", b"")
                        for cb in list(self._listeners.get(channel, set())):
                            try:
                                await cb(payload)
                            except Exception as e:
                                log.debug("Redis listener callback error: %s", e)
            except Exception as e:
                log.debug("Redis stream read error: %s", e)
                await asyncio.sleep(1)

    async def start(self) -> None:
        if not self._started:
            asyncio.create_task(self._listen_loop())
            self._started = True

    async def increment_active_calls(self) -> int:
        return await self._redis.incr("voicetrace:active_calls_count")

    async def decrement_active_calls(self) -> int:
        val = await self._redis.decr("voicetrace:active_calls_count")
        if val < 0:
            await self._redis.set("voicetrace:active_calls_count", 0)
            return 0
        return val

    async def get_active_calls(self) -> int:
        val = await self._redis.get("voicetrace:active_calls_count")
        return int(val) if val else 0


# ── Factory ────────────────────────────────────────────────────────────────

def create_broker():
    redis_url = os.getenv("REDIS_URL", "")
    if redis_url:
        log.info("PubSub: Redis mode  url=%s", redis_url)
        return _RedisBroker(redis_url)
    log.info("PubSub: in-process mode (set REDIS_URL for multi-worker)")
    return _LocalBroker()


broker = create_broker()
