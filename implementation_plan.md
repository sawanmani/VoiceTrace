# VoiceTrace: 100% Operational Stabilization Plan

This plan outlines a phased approach to resolve all outstanding issues discovered during the system audit. Completing these phases will fully enable all advanced features (like live voiceprint and ASR challenges), synchronize frontend/backend state, and ensure the system is stable and production-ready.

## User Review Required

> [!IMPORTANT]
> Please review this phased approach. If you approve, I will execute these phases sequentially.

## Open Questions

> [!NOTE]
> Do you have a preferred TURN server provider (e.g., Twilio Network Traversal Service, Metered.ca, or a self-hosted Coturn instance) for Phase 3, or should I proceed with configuring the existing Metered.ca fallback dynamically?

---

## Proposed Changes

### Phase 1: Dependency & Feature Restoration
The system is currently running in a degraded state because it cannot load the advanced AI models for the live verification challenges.

- **Action:** Install `huggingface_hub` and `speechbrain`.
- **Action:** Install `pytest` and `pytest-asyncio` for the test suite.
- **Verification:** Ensure `server/_model_cache.py` successfully warms up the `asr` (SpeechBrain CRDNN) and `spk` (ECAPA-TDNN) models at startup without crashing.

### Phase 2: Configuration Synchronization
Currently, risk thresholds are hardcoded in both the backend (`config.yaml`) and the frontend (`constants.js`). If one changes, the UI will report incorrect severity bands.

#### [NEW] `server/routes/config_api.py` (or added to `server/main.py`)
- **Action:** Create a `GET /api/config` REST endpoint that exposes the `risk_thresholds` from `config.yaml`.

#### [MODIFY] `dashboard/src/lib/constants.js`
- **Action:** Update the frontend to fetch these thresholds on application load (or in a React hook) instead of relying on hardcoded values.

### Phase 3: Test Suite & Edge Case Hardening
- **Action:** Run the full `pytest` suite locally.
- **Action:** Fix any failing tests (especially `test_batch_worker.py` and `test_e2e_demo.py`) that may have broken due to the recent merge conflicts and structural changes.

### Phase 4: Production Readiness & Security
- **Action:** Ensure `TWILIO_VALIDATE_SIGNATURE` is properly documented and ready for production toggling.
- **Action:** Add a `/api/webrtc/credentials` endpoint to dispense time-limited TURN server credentials to the frontend, replacing the hardcoded public STUN servers for robust NAT traversal across enterprise firewalls.

---

## Verification Plan

### Automated Tests
- Run `pytest -v` to ensure 100% pass rate.
- Run `smoke_test.sh` (if functional in Windows/Git Bash).

### Manual Verification
- Restart the FastAPI server and monitor the logs to ensure "Warmed up SpeechBrain ASR" and "Warmed up ECAPA-TDNN speaker model" appear successfully.
- Load the Dashboard and verify it correctly fetches thresholds from the new API.
- Trigger a WebRTC side-channel call and verify that the "Challenge" workflow works fully with ASR evaluating the spoken response.
