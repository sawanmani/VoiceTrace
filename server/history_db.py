"""
VoiceTrace — server/history_db.py

SQLite-backed store for persisting call telemetry and historical records.
Prevents the "Ephemeral State" vulnerability where all history is lost on server restart.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any

import aiosqlite

log = logging.getLogger("voicetrace.history_db")
_DB_PATH = Path("models") / "history.db"

async def init_db() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(_DB_PATH)) as conn:
        await conn.execute("PRAGMA journal_mode=WAL")
        
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
        await conn.commit()

async def log_event(call_id: str, event_dict: dict) -> None:
    """Logs a single processed telemetry window."""
    try:
        signals = json.dumps(event_dict.get("signals", {}))
        async with aiosqlite.connect(str(_DB_PATH)) as conn:
            await conn.execute(
                """
                INSERT INTO events 
                (call_id, time_str, risk_score, band, latency_ms, window_index, signals_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    call_id,
                    event_dict.get("timeStr", ""),
                    event_dict.get("risk_score", 0.0),
                    event_dict.get("band", "low"),
                    event_dict.get("latency_ms", 0.0),
                    event_dict.get("window_index", 0),
                    signals
                )
            )
            await conn.commit()
    except Exception as e:
        log.error(f"Failed to log event to history DB: {e}")

async def save_call(call_data: dict) -> None:
    """Saves a finalized call summary."""
    try:
        async with aiosqlite.connect(str(_DB_PATH)) as conn:
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
                    call_data.get("completed", True)
                )
            )
            await conn.commit()
    except Exception as e:
        log.error(f"Failed to save call to history DB: {e}")

async def get_recent_calls(limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves the most recent completed calls for the dashboard."""
    await init_db()
    calls = []
    try:
        async with aiosqlite.connect(str(_DB_PATH)) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT * FROM calls ORDER BY rowid DESC LIMIT ?", (limit,)
            )
            rows = await cursor.fetchall()
            for r in rows:
                calls.append({
                    "call_id": r["call_id"],
                    "time": r["time"],
                    "peak_risk": r["peak_risk"],
                    "band": r["band"],
                    "windows": r["windows"],
                    "duration_sec": r["duration_sec"],
                    "completed": bool(r["completed"])
                })
    except Exception as e:
        log.error(f"Failed to fetch recent calls: {e}")
    return calls
