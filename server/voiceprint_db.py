"""
VoiceTrace — server/voiceprint_db.py  (FIX 5: Per-user voiceprint persistence)

SQLite-backed voiceprint store.
Maps user_id (str) → ECAPA-TDNN embedding (numpy float32 array).
Thread-safe via connection-per-call pattern (SQLite WAL mode).
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

import numpy as np

log = logging.getLogger("voicetrace.vpdb")

_DB_PATH = Path("models") / "voiceprints.db"


def _get_conn() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS voiceprints (
            user_id  TEXT PRIMARY KEY,
            embedding BLOB NOT NULL,
            dtype     TEXT NOT NULL DEFAULT 'float32',
            shape     TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def save_embedding(user_id: str, embedding: np.ndarray) -> None:
    """Persist a speaker embedding for user_id."""
    conn = _get_conn()
    try:
        blob = embedding.astype(np.float32).tobytes()
        shape = str(list(embedding.shape))
        conn.execute(
            "INSERT OR REPLACE INTO voiceprints (user_id, embedding, dtype, shape) VALUES (?, ?, ?, ?)",
            (user_id, blob, "float32", shape),
        )
        conn.commit()
        log.info("Saved voiceprint for user_id=%s  shape=%s", user_id, shape)
    finally:
        conn.close()


def load_embedding(user_id: str) -> np.ndarray | None:
    """Load a speaker embedding for user_id. Returns None if not enrolled."""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT embedding, shape FROM voiceprints WHERE user_id = ?", (user_id,)
        ).fetchone()
        if row is None:
            return None
        blob, shape_str = row
        import ast
        shape = tuple(ast.literal_eval(shape_str))
        arr = np.frombuffer(blob, dtype=np.float32).reshape(shape).copy()
        return arr
    finally:
        conn.close()


def delete_embedding(user_id: str) -> None:
    """Remove a user's voiceprint (e.g., on account deletion)."""
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM voiceprints WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
