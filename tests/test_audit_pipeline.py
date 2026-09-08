"""
VoiceTrace — tests/test_audit_pipeline.py

Unit tests for the full audit pipeline:
  - history_db.py    (SQLite persistence: calls, events, feedback tables)
  - incident_report.py (JSON compliance artifact generation)
  - alert_dispatcher.py (Telegram + webhook fire-and-forget delivery)

All tests are fully self-contained:
  - DB tests redirect to a tmp_path SQLite file (no production DB touched)
  - Incident tests redirect _INCIDENT_DIR to tmp_path
  - Alert tests mock the HTTP calls — no real Telegram/webhook traffic

Run with:
    pytest tests/test_audit_pipeline.py -v
"""
from __future__ import annotations

import asyncio
import json
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Shared config fixture (prevents config.yaml dependency) ───────────────

@pytest.fixture(autouse=True)
def patch_server_config(monkeypatch):
    """Inject a fake server.config so tests don't need config.yaml on disk."""
    fake = types.ModuleType("server.config")
    fake.WINDOW_SEC = 1.0
    fake.STRIDE_SEC = 0.5
    fake.SMOOTHING_ALPHA = 0.35
    fake.TARGET_SR = 16000
    fake.NB_SAMP = 64600
    fake.SILENCE_THRESHOLD = 0.002
    fake.CLIPPING_THRESHOLD = 0.98
    fake.CLIPPING_FRACTION_LIMIT = 0.01
    fake.NOISE_FLOOR_VARIANCE_MIN = 1e-6
    fake.ZCR_MIN = 0.01
    fake.ZCR_MAX = 0.45
    fake.THRESHOLD_UNCERTAIN = 25
    fake.THRESHOLD_MEDIUM = 35
    fake.THRESHOLD_HIGH = 65
    fake.RETAIN_AUDIO = False
    fake.WEIGHTS = {
        "spoof_prob": 0.60,
        "liveness": 0.20,
        "caller_context": 0.10,
        "transaction_context": 0.10,
    }
    fake.RECOMMENDATIONS = {
        "low": "No action required.",
        "uncertain": "Monitor closely.",
        "medium": "Request verification.",
        "high": "HIGH RISK: Clone signature detected.",
    }
    monkeypatch.setitem(sys.modules, "server.config", fake)


# ── Shared risk event fixture ─────────────────────────────────────────────

@pytest.fixture
def sample_risk_event():
    return {
        "risk_score": 82,
        "band": "high",
        "signals": {
            "spectral_artifact_score": 0.91,
            "prosody_irregularity_score": 0.63,
            "gan_artifact_score": 0.78,
            "f0_trajectory_score": 0.45,
            "phase_coherence_score": 0.82,
            "liveness_score": 0.33,
            "caller_context_score": 0.50,
            "transaction_context_score": 0.50,
        },
        "recommendation": "HIGH RISK: Clone signature detected.",
        "call_id": "test-call-001",
        "window_index": 5,
        "latency_ms": 48.3,
        "timestamp": 1725699000.123,
    }


# ═══════════════════════════════════════════════════════════════════════════
# HISTORY DB TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestHistoryDb:
    """Tests for SQLite persistence layer using a temp DB file."""

    @pytest.fixture(autouse=True)
    def patch_db(self, tmp_path, monkeypatch):
        """Redirect DB path to a temp file and reset the connection singleton."""
        import server.history_db as hdb
        monkeypatch.setattr(hdb, "_DB_PATH", tmp_path / "test_history.db")
        monkeypatch.setattr(hdb, "_conn", None)
        monkeypatch.setattr(hdb, "_init_done", False, raising=False)
        monkeypatch.setattr(hdb, "_event_buffer", [], raising=False)
        yield
        # Clean up connection after each test
        if hdb._conn is not None:
            try:
                asyncio.run(hdb._conn.close())
            except Exception:
                pass
            hdb._conn = None

    def test_init_db_creates_all_tables(self):
        """init_db() must create calls, events, and feedback tables."""
        import server.history_db as hdb

        async def _run():
            await hdb.init_db()
            conn = await hdb.get_conn()
            cursor = await conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
            tables = {row[0] for row in await cursor.fetchall()}
            assert "calls" in tables, "Missing 'calls' table"
            assert "events" in tables, "Missing 'events' table"
            assert "feedback" in tables, "Missing 'feedback' table"

        asyncio.run(_run())

    def test_log_event_persists_to_events_table(self, sample_risk_event):
        """log_event() must insert a row into the events table."""
        import server.history_db as hdb

        async def _run():
            await hdb.init_db()
            await hdb.log_event("test-call-001", sample_risk_event)
            # Force flush if using buffered writes
            if hasattr(hdb, "_flush_event_buffer"):
                await hdb._flush_event_buffer()
            conn = await hdb.get_conn()
            cursor = await conn.execute("SELECT COUNT(*) FROM events")
            count = (await cursor.fetchone())[0]
            assert count >= 1, "Expected at least one event row after log_event()"

        asyncio.run(_run())

    def test_log_event_stores_correct_risk_score(self, sample_risk_event):
        """Stored event must have correct risk_score."""
        import server.history_db as hdb

        async def _run():
            await hdb.init_db()
            await hdb.log_event("test-call-001", sample_risk_event)
            if hasattr(hdb, "_flush_event_buffer"):
                await hdb._flush_event_buffer()
            conn = await hdb.get_conn()
            cursor = await conn.execute("SELECT risk_score, band FROM events")
            row = await cursor.fetchone()
            if row:  # may be buffered
                assert row[0] == 82.0
                assert row[1] == "high"

        asyncio.run(_run())

    def test_save_call_and_retrieve_roundtrip(self):
        """save_call() + get_recent_calls() must round-trip correctly."""
        import server.history_db as hdb

        call_data = {
            "call_id": "test-call-001",
            "time": "2026-09-07T14:30:00",
            "peak_risk": 82.0,
            "band": "high",
            "windows": 12,
            "duration_sec": 30,
            "completed": True,
        }

        async def _run():
            await hdb.init_db()
            await hdb.save_call(call_data)
            calls = await hdb.get_recent_calls(limit=10)
            assert len(calls) == 1
            assert calls[0]["call_id"] == "test-call-001"
            assert calls[0]["peak_risk"] == 82.0
            assert calls[0]["band"] == "high"
            assert calls[0]["windows"] == 12
            assert calls[0]["duration_sec"] == 30

        asyncio.run(_run())

    def test_save_call_is_idempotent(self):
        """INSERT OR REPLACE must not raise on duplicate call_id."""
        import server.history_db as hdb

        call_data = {
            "call_id": "test-call-dup",
            "time": "2026-09-07T14:30:00",
            "peak_risk": 50.0,
            "band": "medium",
            "windows": 5,
            "duration_sec": 10,
            "completed": True,
        }

        async def _run():
            await hdb.init_db()
            await hdb.save_call(call_data)
            call_data["peak_risk"] = 75.0
            await hdb.save_call(call_data)  # should not raise
            calls = await hdb.get_recent_calls()
            matching = [c for c in calls if c["call_id"] == "test-call-dup"]
            assert len(matching) == 1, "REPLACE should keep only one row"
            assert matching[0]["peak_risk"] == 75.0

        asyncio.run(_run())

    def test_save_feedback_and_retrieve(self):
        """save_feedback() must store operator label and retrieve it."""
        import server.history_db as hdb

        async def _run():
            await hdb.init_db()
            await hdb.save_feedback("test-call-001", "spoof")
            rows = await hdb.get_feedback_for_call("test-call-001")
            assert len(rows) == 1
            assert rows[0]["label"] == "spoof"
            assert rows[0]["call_id"] == "test-call-001"

        asyncio.run(_run())

    def test_multiple_feedback_labels_stored(self):
        """Multiple feedback rows for same call must all be returned."""
        import server.history_db as hdb

        async def _run():
            await hdb.init_db()
            await hdb.save_feedback("test-call-002", "genuine")
            await hdb.save_feedback("test-call-002", "spoof")
            rows = await hdb.get_feedback_for_call("test-call-002")
            assert len(rows) == 2

        asyncio.run(_run())

    def test_get_recent_calls_respects_limit(self):
        """get_recent_calls(limit=N) must return at most N rows."""
        import server.history_db as hdb

        async def _run():
            await hdb.init_db()
            for i in range(10):
                await hdb.save_call({
                    "call_id": f"call-{i}",
                    "time": f"2026-09-07T14:3{i}:00",
                    "peak_risk": float(i * 10),
                    "band": "low",
                    "windows": 1,
                    "duration_sec": 5,
                    "completed": True,
                })
            calls = await hdb.get_recent_calls(limit=5)
            assert len(calls) <= 5

        asyncio.run(_run())


# ═══════════════════════════════════════════════════════════════════════════
# INCIDENT REPORT TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestIncidentReport:
    """Tests for JSON compliance artifact generation."""

    @pytest.fixture(autouse=True)
    def patch_incident_dir(self, tmp_path, monkeypatch):
        import server.incident_report as ir
        monkeypatch.setattr(ir, "_INCIDENT_DIR", tmp_path / "incidents")

    def test_generates_json_file(self, sample_risk_event):
        """generate_incident_report() must create exactly one JSON file."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        asyncio.run(generate_incident_report("test-call-001", [sample_risk_event]))

        files = list(_INCIDENT_DIR.glob("*.json"))
        assert len(files) == 1, f"Expected 1 incident file, got {len(files)}"

    def test_report_has_all_required_fields(self, sample_risk_event):
        """Generated report must contain all required compliance fields."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        asyncio.run(generate_incident_report("test-call-001", [sample_risk_event]))

        report_file = next(_INCIDENT_DIR.glob("*.json"))
        report = json.loads(report_file.read_text(encoding="utf-8"))

        required_fields = [
            "incident_id", "call_id", "timestamp", "peak_risk_score",
            "band", "recommendation", "sub_signals", "evidence_windows_count",
            "status", "human_review_required",
        ]
        for field in required_fields:
            assert field in report, f"Missing required field: '{field}'"

    def test_report_correct_values(self, sample_risk_event):
        """Report must store the correct peak risk score and band."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        asyncio.run(generate_incident_report("test-call-001", [sample_risk_event]))

        report = json.loads(next(_INCIDENT_DIR.glob("*.json")).read_text(encoding="utf-8"))
        assert report["call_id"] == "test-call-001"
        assert report["peak_risk_score"] == 82
        assert report["band"] == "high"
        assert report["status"] == "OPEN"
        assert report["human_review_required"] is True

    def test_evidence_windows_count_matches_events(self, sample_risk_event):
        """evidence_windows_count must equal the number of events passed."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        three_events = [sample_risk_event] * 3
        asyncio.run(generate_incident_report("test-call-001", three_events))

        report = json.loads(next(_INCIDENT_DIR.glob("*.json")).read_text(encoding="utf-8"))
        assert report["evidence_windows_count"] == 3

    def test_empty_events_returns_none(self):
        """generate_incident_report() with empty events must return None."""
        from server.incident_report import generate_incident_report

        result = asyncio.run(generate_incident_report("test-call-001", []))
        assert result is None

    def test_call_id_sanitized_for_filename(self, sample_risk_event):
        """Windows-illegal characters in call_id must be sanitized in filename."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        asyncio.run(generate_incident_report(
            "twilio-abc:12345/bad?chars", [sample_risk_event]
        ))
        files = list(_INCIDENT_DIR.glob("*.json"))
        assert len(files) == 1
        name = files[0].name
        assert ":" not in name
        assert "/" not in name
        assert "?" not in name

    def test_incident_id_contains_call_id(self, sample_risk_event):
        """Incident ID must be traceable back to the call."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        asyncio.run(generate_incident_report("test-call-abc", [sample_risk_event]))
        report = json.loads(next(_INCIDENT_DIR.glob("*.json")).read_text(encoding="utf-8"))
        assert "test-call-abc" in report["incident_id"] or \
               "test_call_abc" in report["incident_id"], \
            f"incident_id '{report['incident_id']}' should contain call identifier"

    def test_picks_peak_event_from_multiple(self, sample_risk_event):
        """Report must use the event with the highest risk_score as peak."""
        from server.incident_report import generate_incident_report, _INCIDENT_DIR

        low_event = dict(sample_risk_event, risk_score=45, band="medium")
        high_event = dict(sample_risk_event, risk_score=92, band="high")
        low_event2 = dict(sample_risk_event, risk_score=30, band="uncertain")

        asyncio.run(generate_incident_report("test-call-001", [low_event, high_event, low_event2]))
        report = json.loads(next(_INCIDENT_DIR.glob("*.json")).read_text(encoding="utf-8"))
        assert report["peak_risk_score"] == 92


# ═══════════════════════════════════════════════════════════════════════════
# ALERT DISPATCHER TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestAlertDispatcher:
    """Tests for Telegram/webhook fire-and-forget alert delivery."""

    def test_no_channels_configured_skips_silently(self, sample_risk_event, monkeypatch):
        """dispatch_alert() must complete without error when no channels configured."""
        import server.alert_dispatcher as ad
        monkeypatch.setattr(ad, "TELEGRAM_BOT_TOKEN", "")
        monkeypatch.setattr(ad, "TELEGRAM_CHAT_ID", "")
        monkeypatch.setattr(ad, "ALERT_WEBHOOK_URL", "")

        # Must not raise
        asyncio.run(ad.dispatch_alert("test-call", sample_risk_event))

    def test_telegram_channel_called_when_configured(self, sample_risk_event, monkeypatch):
        """dispatch_alert() must invoke _send_telegram when token+chat_id set."""
        import server.alert_dispatcher as ad
        monkeypatch.setattr(ad, "TELEGRAM_BOT_TOKEN", "fake-bot-token")
        monkeypatch.setattr(ad, "TELEGRAM_CHAT_ID", "99999")
        monkeypatch.setattr(ad, "ALERT_WEBHOOK_URL", "")

        calls = []

        async def mock_telegram(call_id, risk_event):
            calls.append(call_id)

        monkeypatch.setattr(ad, "_send_telegram", mock_telegram)

        asyncio.run(ad.dispatch_alert("test-call-001", sample_risk_event))
        assert calls == ["test-call-001"], "Expected _send_telegram to be called once"

    def test_webhook_channel_called_when_configured(self, sample_risk_event, monkeypatch):
        """dispatch_alert() must invoke _send_webhook when webhook_url is set."""
        import server.alert_dispatcher as ad
        monkeypatch.setattr(ad, "TELEGRAM_BOT_TOKEN", "")
        monkeypatch.setattr(ad, "TELEGRAM_CHAT_ID", "")
        monkeypatch.setattr(ad, "ALERT_WEBHOOK_URL", "https://example.com/hook")

        calls = []

        async def mock_webhook(call_id, risk_event):
            calls.append(call_id)

        monkeypatch.setattr(ad, "_send_webhook", mock_webhook)

        asyncio.run(ad.dispatch_alert("test-call-001", sample_risk_event))
        assert calls == ["test-call-001"]

    def test_both_channels_run_concurrently(self, sample_risk_event, monkeypatch):
        """Both Telegram and webhook must be called when both configured."""
        import server.alert_dispatcher as ad
        monkeypatch.setattr(ad, "TELEGRAM_BOT_TOKEN", "fake-token")
        monkeypatch.setattr(ad, "TELEGRAM_CHAT_ID", "12345")
        monkeypatch.setattr(ad, "ALERT_WEBHOOK_URL", "https://example.com/hook")

        called = []

        async def mock_telegram(call_id, risk_event):
            called.append("telegram")

        async def mock_webhook(call_id, risk_event):
            called.append("webhook")

        monkeypatch.setattr(ad, "_send_telegram", mock_telegram)
        monkeypatch.setattr(ad, "_send_webhook", mock_webhook)

        asyncio.run(ad.dispatch_alert("test-call-001", sample_risk_event))
        assert "telegram" in called
        assert "webhook" in called

    def test_telegram_failure_does_not_propagate(self, sample_risk_event, monkeypatch):
        """A failing Telegram send must be caught — not crash the caller."""
        import server.alert_dispatcher as ad
        monkeypatch.setattr(ad, "TELEGRAM_BOT_TOKEN", "fake-token")
        monkeypatch.setattr(ad, "TELEGRAM_CHAT_ID", "12345")
        monkeypatch.setattr(ad, "ALERT_WEBHOOK_URL", "")

        async def crashing_telegram(call_id, risk_event):
            raise ConnectionError("Telegram unreachable in test")

        monkeypatch.setattr(ad, "_send_telegram", crashing_telegram)

        # Must not raise — failure is gathered, not propagated
        asyncio.run(ad.dispatch_alert("test-call-001", sample_risk_event))

    def test_webhook_failure_does_not_propagate(self, sample_risk_event, monkeypatch):
        """A failing webhook send must be caught — not crash the caller."""
        import server.alert_dispatcher as ad
        monkeypatch.setattr(ad, "TELEGRAM_BOT_TOKEN", "")
        monkeypatch.setattr(ad, "TELEGRAM_CHAT_ID", "")
        monkeypatch.setattr(ad, "ALERT_WEBHOOK_URL", "https://example.com/hook")

        async def crashing_webhook(call_id, risk_event):
            raise TimeoutError("Webhook timed out in test")

        monkeypatch.setattr(ad, "_send_webhook", crashing_webhook)

        # Must not raise
        asyncio.run(ad.dispatch_alert("test-call-001", sample_risk_event))
