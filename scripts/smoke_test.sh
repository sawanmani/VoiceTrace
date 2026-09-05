#!/usr/bin/env bash
# VoiceTrace smoke test — proves a clean checkout actually runs, end to end.
# Run this after every fix pass. If this fails, nothing else in the repo matters yet.
set -euo pipefail

HOST="127.0.0.1"
PORT="8000"
BASE="http://${HOST}:${PORT}"

echo "[1/4] Starting server..."
uvicorn server.main:app --host "${HOST}" --port "${PORT}" &
SERVER_PID=$!
trap 'echo "Stopping server (pid $SERVER_PID)..."; kill $SERVER_PID 2>/dev/null || true' EXIT

echo "[2/4] Waiting for /health..."
for i in $(seq 1 20); do
  if curl -sf "${BASE}/health" > /dev/null 2>&1; then
    echo "  /health OK after ${i}s"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "FAIL: /health never came up after 20s"
    exit 1
  fi
  sleep 1
done

echo "[3/4] Testing WebSocket auth handshake (WS /ws/call/{id})..."
# Requires: pip install websocket-client
python3 - <<'PYEOF'
import json
import os
import sys

try:
    import websocket
except ImportError:
    print("SKIP: websocket-client not installed (pip install websocket-client)")
    sys.exit(0)

api_key = os.environ.get("VOICETRACE_API_KEY", "dev_key_123")
call_id = "smoke-test-001"
ws = websocket.create_connection(f"ws://127.0.0.1:8000/ws/call/{call_id}", timeout=10)

# Post-connect auth frame — matches the FIXED handshake, not the old query-string one.
ws.send(json.dumps({"type": "auth", "api_key": api_key}))

# Send one silent 1s window of 16kHz mono PCM (all zeros — should NOT crash,
# and should NOT silently fall back to demo data; a real server should
# either score it or reject it explicitly).
import struct
silence = struct.pack("<16000h", *([0] * 16000))
ws.send_binary(silence)

result = ws.recv()
print("Received:", result[:200])
ws.close()
print("WS AUTH HANDSHAKE: reachable, no crash, no timeout.")
PYEOF

echo "[4/4] Smoke test complete."
echo ""
echo "NOTE: this script proves the server boots and the WS path is reachable."
echo "It does NOT yet assert real vs. mock scoring — add that assertion once"
echo "the DEMO_SEQUENCE fallback (useMicStream.js) is removed per the audit."
