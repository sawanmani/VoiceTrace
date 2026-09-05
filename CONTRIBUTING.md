# Contributing to VoiceTrace

Welcome to VoiceTrace! To keep our codebase clean, conflict-free, and easy to navigate, please follow these guidelines when submitting Pull Requests (PRs).

## Core Principles

1. **No Monolithic Files:** Keep components and modules small and focused.
2. **Single Source of Truth:** Never hardcode URLs, thresholds, or colors.
   - Frontend: `dashboard/src/lib/constants.js`
   - Backend: `config.yaml` (⚠️ `config/risk_weights.json` is a duplicate that disagrees with `config.yaml` and is scheduled for deletion — do not edit it, and do not add new config there)
3. **Strict Data Contracts:** The backend dictates the JSON schema. The frontend is a "dumb" client. Any changes to the `RiskEvent` shape must be reflected in `server/schemas.py` and `ARCHITECTURE.md`.
4. **Privacy First:** Never log or save raw audio to disk. This is enforced by `retain_audio: false` in `config.yaml`.
5. **Verify before you claim a fix.** Run `scripts/smoke_test.sh` after every change touching `server/` or `dashboard/src/hooks/`. Do not merge a PR described as "fixes X" without having personally reproduced X failing, then passing, on a clean checkout. (This project has twice shipped a "fix" commit that broke the thing it claimed to fix — see `docs/PATCH_REPORT.md` for the history. This rule exists because of that, not as a formality.)

## Module Ownership & Architecture

### Backend (`/server`, `/detector`)
- **`server/main.py`**: A thin router. It handles HTTP/WS setup and delegates all logic.
- **`server/connection_manager.py`**: Manages all WebSocket subscriber state and broadcasts.
- **`server/schemas.py`**: Pydantic models defining the exact JSON shape of our API.
- **`server/risk_engine.py`**: Turns inference results into `RiskEvent` objects based on config weights.
- **`server/challenge.py`**: ASR liveness challenge — must fail **closed** (return `False`/high-risk) on any error, never fail open.
- **`detector/streaming.py`**: The core ML pipeline (Liveness check + AASIST-L + EMA smoothing).

### Frontend (`/dashboard`)
- **`src/App.jsx`**: A thin orchestrator. It sets up the layout and ties hooks to components. No business logic belongs here.
- **`src/components/`**: Isolated, pure React components.
- **`src/hooks/`**: Reusable custom hooks (`useSession`, `useMicStream`, `useWebSocket`). These must never silently substitute mock/demo data on a connection or auth failure — surface a visible error state instead.
- **`src/lib/constants.js`**: All thresholds, colors, timings, and API URLs.
- **`src/lib/api.js` & `utils.js`**: Helpers and network wrappers.

## Contributor task ladder

Pick a task at your comfort level. Tag: 🟢 first PR / 🟡 needs repo context / 🔴 core team only.

| Tier | Task | Why it's this tier |
|---|---|---|
| 🟢 | Delete `detector/stream.py` (unused, contradicts `detector/streaming.py`'s windowing config) and remove any dangling references | Self-contained, low-risk, teaches you the codebase layout |
| 🟢 | Delete `config/risk_weights.json`; confirm nothing imports it | Same — safe, well-specified |
| 🟢 | Add `*.log`, `*.exe`, `cloudflared*` to `.gitignore` if not already present | One-line, zero-risk |
| 🟡 | Write a `pytest` unit test for `RiskEngine`'s composite score against `config.yaml`'s weights | Needs to read one module closely, but no cross-file coordination |
| 🟡 | Write a unit test for the µ-law/PCM codec functions (`decode_twilio_chunk`, `_resample`) | Same tier — isolated, testable logic |
| 🟡 | Fix the WS auth handshake in `useWebSocket.js` **and** `useMicStream.js` together (they must change in the same PR — see `docs/PATCH_REPORT.md`) | Requires understanding the client/server contract on both sides |
| 🟡 | Wire `server/history_db.py`'s `log_event`/`save_call` into `batch_worker.py` and `connection_manager.disconnect_call`, or remove the file if not pursuing persistent history yet | Needs to trace the call lifecycle across files |
| 🔴 | Move `batch_worker.py`'s model forward pass and `speaker_embedding.py`'s `verify()`/`enroll()` off the asyncio event loop, verified under 2+ concurrent simulated calls | Needs async/threading understanding and load-testing to confirm the fix, not just that it compiles |
| 🔴 | Load-test the WebSocket pipeline (Locust/K6) and publish real concurrency/latency numbers | Needs infra access and benchmarking discipline |

## Workflow

1. Create a branch: `feature/your-feature-name` or `bugfix/issue-description`
2. Make your changes, adhering to the principles above.
3. Run `scripts/smoke_test.sh` and paste the output in your PR description.
4. If changing the API, update `schemas.py` and `ARCHITECTURE.md`.
5. Submit a PR against `main`.

## PR Template

When opening a PR, please ensure your description includes:
- **What this PR does**
- **Why this approach was chosen**
- **Impact on the API contract (if any)**
- **Verification steps performed** (include smoke-test output, not just "tested locally")
