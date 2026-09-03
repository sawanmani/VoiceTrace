"""
VoiceTrace — server/alert_dispatcher.py

Fire-and-forget alert delivery when a call crosses the high-risk threshold.
Currently supports:
  - Telegram Bot API (free, no cost)
  - Generic webhook (POST JSON to any URL)

Design:
  - Async, non-blocking: wrapped in asyncio.create_task() in batch_worker.py
  - Never blocks the inference pipeline
  - Gracefully degrades: if Telegram/webhook fails, logs warning and continues
  - Deduplication handled upstream by CallState.incident_generated flag
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

import httpx

log = logging.getLogger("voicetrace.alerts")

# Load alert config (gracefully handle missing config)
try:
    from server.config import (
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID,
        ALERT_WEBHOOK_URL,
    )
except (ImportError, KeyError):
    TELEGRAM_BOT_TOKEN = ""
    TELEGRAM_CHAT_ID = ""
    ALERT_WEBHOOK_URL = ""


async def dispatch_alert(call_id: str, risk_event: dict) -> None:
    """
    Send alert notifications for a high-risk call detection.

    This function is called via asyncio.create_task() — fire and forget.
    It MUST NOT raise exceptions that would crash the event loop.

    Args:
        call_id: The call identifier (e.g., "asterisk-abc12345")
        risk_event: Dict from RiskEvent.to_dict() with risk_score, band, signals, etc.
    """
    tasks = []

    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        tasks.append(_send_telegram(call_id, risk_event))

    if ALERT_WEBHOOK_URL:
        tasks.append(_send_webhook(call_id, risk_event))

    if not tasks:
        log.debug("alert_dispatcher  no alert channels configured — skipping")
        return

    # Run all alert channels concurrently, catch individual failures
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            log.warning("alert_dispatcher  channel %d failed: %s", i, result)


async def _send_telegram(call_id: str, risk_event: dict) -> None:
    """Send a formatted alert message to Telegram."""
    risk_score = risk_event.get("risk_score", 0)
    band = risk_event.get("band", "unknown")
    signals = risk_event.get("signals", {})
    recommendation = risk_event.get("recommendation", "")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")

    # Format signal scores as visual bars
    signal_lines = []
    for name, score in signals.items():
        if isinstance(score, (int, float)):
            bar_filled = int(score * 10)
            bar = "\u2588" * bar_filled + "\u2591" * (10 - bar_filled)
            signal_lines.append(f"  {name}: {bar} {score:.2f}")

    signals_text = "\n".join(signal_lines) if signal_lines else "  No signals available"

    message = (
        f"\U0001f6a8 *VoiceTrace \u2014 Clone Detection Alert*\n\n"
        f"\U0001f4de *Call ID:* `{call_id}`\n"
        f"\u23f0 *Time:* {timestamp}\n"
        f"\U0001f3af *Risk Score:* {risk_score}/100\n"
        f"\U0001f534 *Band:* {band.upper()}\n\n"
        f"\U0001f4ca *Sub-Signal Breakdown:*\n"
        f"{signals_text}\n\n"
        f"\U0001f4a1 *Recommendation:*\n{recommendation}\n\n"
        f"\U0001f3db _SIH 2026 \u2014 PSID 260104 \u2014 VoiceTrace_"
    )

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code == 200:
            log.info("alert_dispatcher  Telegram sent  call=%s  risk=%d",
                    call_id, risk_score)
        else:
            log.warning(
                "alert_dispatcher  Telegram failed  status=%d  body=%s",
                resp.status_code, resp.text[:200],
            )


async def _send_webhook(call_id: str, risk_event: dict) -> None:
    """Send alert to a generic webhook URL (POST JSON)."""
    payload = {
        "source": "voicetrace",
        "event": "clone_detected",
        "call_id": call_id,
        "timestamp": datetime.now().isoformat(),
        **risk_event,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(ALERT_WEBHOOK_URL, json=payload)
        log.info("alert_dispatcher  webhook sent  call=%s  status=%d",
                call_id, resp.status_code)
