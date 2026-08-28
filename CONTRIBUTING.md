# Contributing to VoiceTrace

Welcome to VoiceTrace! To keep our codebase clean, conflict-free, and easy to navigate, please follow these guidelines when submitting Pull Requests (PRs).

## Core Principles

1. **No Monolithic Files:** Keep components and modules small and focused.
2. **Single Source of Truth:** Never hardcode URLs, thresholds, or colors.
   - Frontend: `dashboard/src/lib/constants.js`
   - Backend: `config.yaml`
3. **Strict Data Contracts:** The backend dictates the JSON schema. The frontend is a "dumb" client. Any changes to the `RiskEvent` shape must be reflected in `server/schemas.py` and `ARCHITECTURE.md`.
4. **Privacy First:** Never log or save raw audio to disk. This is enforced by `LOG_RAW_AUDIO: false` in `config.yaml`.

## Module Ownership & Architecture

### Backend (`/server`, `/detector`)
- **`server/main.py`**: A thin router. It handles HTTP/WS setup and delegates all logic.
- **`server/connection_manager.py`**: Manages all WebSocket subscriber state and broadcasts.
- **`server/schemas.py`**: Pydantic models defining the exact JSON shape of our API.
- **`server/risk_engine.py`**: Turns inference results into `RiskEvent` objects based on config weights.
- **`detector/streaming.py`**: The core ML pipeline (Liveness check + AASIST-L + EMA smoothing).

### Frontend (`/dashboard`)
- **`src/App.jsx`**: A thin orchestrator. It sets up the layout and ties hooks to components. No business logic belongs here.
- **`src/components/`**: Isolated, pure React components.
- **`src/hooks/`**: Reusable custom hooks (`useSession`, `useMicStream`, `useWebSocket`).
- **`src/lib/constants.js`**: All thresholds, colors, timings, and API URLs.
- **`src/lib/api.js` & `utils.js`**: Helpers and network wrappers.

## Workflow

1. Create a branch: `feature/your-feature-name` or `bugfix/issue-description`
2. Make your changes, adhering to the principles above.
3. If changing the API, update `schemas.py` and `ARCHITECTURE.md`.
4. Submit a PR against `main`.

## PR Template

When opening a PR, please ensure your description includes:
- **What this PR does**
- **Why this approach was chosen**
- **Impact on the API contract (if any)**
- **Verification steps performed**
