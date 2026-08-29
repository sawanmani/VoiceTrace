"""
VoiceTrace — server/voiceprint_db.py  (FIX 5: Per-user voiceprint persistence)

SQLite-backed voiceprint store.
Maps user_id (str) → ECAPA-TDNN embedding (numpy float32 array).
Thread-safe via connection-per-call pattern (SQLite WAL mode).
Now utilizing aiosqlite for non-blocking I/O.
"""
from __future__ import annotations

import logging
from pathlib import Path

import aiosqlite
import numpy as np

log = logging.getLogger("voicetrace.vpdb")

_DB_PATH = Path("models") / "voiceprints.db"


async def _init_db() -> None:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(_DB_PATH)) as conn:
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS voiceprints (
                user_id  TEXT PRIMARY KEY,
                embedding BLOB NOT NULL,
                dtype     TEXT NOT NULL DEFAULT 'float32',
                shape     TEXT NOT NULL
            )
            """
        )
        await conn.commit()


async def save_embedding(user_id: str, embedding: np.ndarray) -> None:
    """Persist a speaker embedding for user_id."""
    await _init_db()
    async with aiosqlite.connect(str(_DB_PATH)) as conn:
        blob = embedding.astype(np.float32).tobytes()
        shape = str(list(embedding.shape))
        await conn.execute(
            "INSERT OR REPLACE INTO voiceprints (user_id, embedding, dtype, shape) VALUES (?, ?, ?, ?)",
            (user_id, blob, "float32", shape),
        )
        await conn.commit()
        log.info("Saved voiceprint for user_id=%s  shape=%s", user_id, shape)


async def load_embedding(user_id: str) -> np.ndarray | None:
    """Load a speaker embedding for user_id. Returns None if not enrolled."""
    await _init_db()
    async with aiosqlite.connect(str(_DB_PATH)) as conn:
        async with conn.execute(
            "SELECT embedding, shape FROM voiceprints WHERE user_id = ?", (user_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            blob, shape_str = row
            import ast
            shape = tuple(ast.literal_eval(shape_str))
            arr = np.frombuffer(blob, dtype=np.float32).reshape(shape).copy()
            return arr


async def delete_embedding(user_id: str) -> None:
    """Remove a user's voiceprint (e.g., on account deletion)."""
    await _init_db()
    async with aiosqlite.connect(str(_DB_PATH)) as conn:
        await conn.execute("DELETE FROM voiceprints WHERE user_id = ?", (user_id,))
        await conn.commit()
