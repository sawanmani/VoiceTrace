"""
VoiceTrace — server/history_db.py

SQLite-backed store for persisting call telemetry and historical records.
Prevents the "Ephemeral State" vulnerability where all history is lost on server restart.

Fixes applied:
  - M3: Write coalescing — events are buffered and flushed every 1 second
         via executemany(), reducing ~100 individual writes/sec to 1 batch/sec.
  - M4: Reconnect logic — get_conn() pings connection; reconnects on stale handle.
  - L1: Removed dead `if True:` guards that added noise with no benefit.
"""
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List
from datetime import datetime

import aiosqlite

log = logging.getLogger("voicetrace.history_db")
_DB_PATH = Path("models") / "history.db"

_conn = None
_init_done = False  # M4: track whether init has run so we only run it once

# ── M3: Write buffer for event batching ───────────────────────────────────
_event_buffer: List[tuple] = []
_buffer_lock = asyncio.Lock()
_last_flush: float = 0.0
_FLUSH_INTERVAL_SEC = 1.0   # flush accumulated events every 1 second


async def get_conn() -> aiosqlite.Connection:
    """
    Return the active SQLite connection, reconnecting if stale (Fix M4).
    """
    global _conn

    # Ping existing connection before reusing
    if _conn is not None:
        try:
            await _conn.execute("SELECT 1")
            return _conn
        except Exception:
            log.warning("history_db  DB connection stale — reconnecting")
            try:
                await _conn.close()
            except Exception:
                pass
            _conn = None

    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _conn = await aiosqlite.connect(str(_DB_PATH))
    await _conn.execute("PRAGMA journal_mode=WAL")
    await _conn.execute("PRAGMA synchronous=NORMAL")  # faster without losing ACID on WAL
    return _conn


async def init_db() -> None:
    """
    Create all tables and indexes if they don't exist.
    Safe to call multiple times (idempotent).
    """
    global _init_done
    if _init_done:
        return

    conn = await get_conn()

    # Table for completed call summaries
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS calls (
            call_id TEXT PRIMARY KEY,
            time TEXT NOT NULL,
            peak_risk REAL NOT NULL,
            band TEXT NOT NULL,
            windows INTEGER NOT NULL,
            duration_sec INTEGER NOT NULL,
            completed BOOLEAN NOT NULL DEFAULT 1
        )
        """
    )

    # Table for individual scored window events
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id TEXT NOT NULL,
            time_str TEXT NOT NULL,
            risk_score REAL NOT NULL,
            band TEXT NOT NULL,
            latency_ms REAL NOT NULL,
            window_index INTEGER NOT NULL,
            signals_json TEXT NOT NULL
        )
        """
    )

    # Table for operator feedback
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id TEXT NOT NULL,
            label TEXT NOT NULL,
            time_str TEXT NOT NULL
        )
        """
    )

    # Indexes for performance
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_call_id ON events (call_id)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_time ON events (time_str)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_calls_time ON calls (time)")
    await conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_call_id ON feedback (call_id)")

    await conn.commit()
    _init_done = True
    log.info("history_db  DB initialised at %s", _DB_PATH)


async def _flush_event_buffer() -> None:
    """
    Flush buffered events to SQLite using a single executemany() call.
    Called internally by log_event() on a 1-second interval.
    """
    global _last_flush

    async with _buffer_lock:
        if not _event_buffer:
            return
        rows_to_flush = list(_event_buffer)
        _event_buffer.clear()
        _last_flush = time.monotonic()

    try:
        conn = await get_conn()
        await conn.executemany(
            """INSERT INTO events
               (call_id, time_str, risk_score, band, latency_ms, window_index, signals_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            rows_to_flush,
        )
        await conn.commit()
    except Exception as e:
        log.error("history_db  failed to batch flush %d events: %s", len(rows_to_flush), e)


async def log_event(call_id: str, event_dict: dict) -> None:
    """
    Buffer a single processed telemetry window; flush to SQLite every second.
    Fix M3: reduces ~100 individual writes/sec (at 50 concurrent calls) to
    1 executemany() batch per second.
    """
    try:
        signals = json.dumps(event_dict.get("signals", {}))
        ts = event_dict.get("timestamp", 0)
        time_str = datetime.fromtimestamp(ts).isoformat() if ts else ""

        row = (
            call_id,
            time_str,
            event_dict.get("risk_score", 0.0),
            event_dict.get("band", "low"),
            event_dict.get("latency_ms", 0.0),
            event_dict.get("window_index", 0),
            signals,
        )

        async with _buffer_lock:
            _event_buffer.append(row)
            should_flush = (time.monotonic() - _last_flush) >= _FLUSH_INTERVAL_SEC

        if should_flush:
            await _flush_event_buffer()

    except Exception as e:
        log.error("history_db  failed to buffer event: %s", e)


async def save_call(call_data: dict) -> None:
    """Save a finalized call summary (INSERT OR REPLACE — idempotent)."""
    try:
        conn = await get_conn()
        await conn.execute(
            """
            INSERT OR REPLACE INTO calls
            (call_id, time, peak_risk, band, windows, duration_sec, completed)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                call_data.get("call_id"),
                call_data.get("time"),
                call_data.get("peak_risk"),
                call_data.get("band"),
                call_data.get("windows"),
                call_data.get("duration_sec"),
                call_data.get("completed", True),
            ),
        )
        await conn.commit()
    except Exception as e:
        log.error("history_db  failed to save call: %s", e)


async def get_recent_calls(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve the most recent completed calls for the dashboard."""
    await init_db()
    calls = []
    try:
        conn = await get_conn()
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT * FROM calls ORDER BY rowid DESC LIMIT ?", (limit,)
        )
        rows = await cursor.fetchall()
        for r in rows:
            calls.append(
                {
                    "call_id": r["call_id"],
                    "time": r["time"],
                    "peak_risk": r["peak_risk"],
                    "band": r["band"],
                    "windows": r["windows"],
                    "duration_sec": r["duration_sec"],
                    "completed": bool(r["completed"]),
                }
            )
    except Exception as e:
        log.error("history_db  failed to fetch recent calls: %s", e)
    return calls


async def save_feedback(call_id: str, label: str) -> None:
    """Persist an operator feedback label for a call (active-learning loop)."""
    await init_db()
    try:
        conn = await get_conn()
        await conn.execute(
            """
            INSERT INTO feedback (call_id, label, time_str)
            VALUES (?, ?, ?)
            """,
            (call_id, label, datetime.now().isoformat()),
        )
        await conn.commit()
        log.info("history_db  feedback saved  call=%s  label=%s", call_id, label)
    except Exception as e:
        log.error("history_db  failed to save feedback: %s", e)


async def get_feedback_for_call(call_id: str) -> List[Dict[str, Any]]:
    """Return all feedback labels recorded for a given call."""
    await init_db()
    rows_out = []
    try:
        conn = await get_conn()
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT * FROM feedback WHERE call_id = ? ORDER BY id",
            (call_id,),
        )
        rows = await cursor.fetchall()
        for r in rows:
            rows_out.append(
                {
                    "call_id": r["call_id"],
                    "label": r["label"],
                    "time_str": r["time_str"],
                }
            )
    except Exception as e:
        log.error("history_db  failed to fetch feedback: %s", e)
    return rows_out
