/**
 * dashboard/src/lib/constants.js
 *
 * SINGLE SOURCE OF TRUTH for all frontend configuration.
 *
 * Rules:
 *  - Never import thresholds or colors directly in components.
 *  - Every magic number lives here with a name and a comment.
 *  - Changing a threshold means editing ONE line, not hunting across files.
 */

// ── Backend URL ────────────────────────────────────────────────────────────
// Reads from Vite env var (dashboard/.env → VITE_API_URL=http://localhost:8000)
// Falls back to localhost:8000 for local dev.
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const WS_BASE  = API_BASE.replace(/^http/, 'ws')

// ── Risk thresholds (must match config.yaml risk_thresholds) ──────────────
export const THRESHOLD_LOW       = 0    // 0–24  → low (genuine)
export const THRESHOLD_UNCERTAIN = 25   // 25–34 → uncertain (borderline)
export const THRESHOLD_MEDIUM    = 35   // 35–64 → medium (suspicious)
export const THRESHOLD_HIGH      = 65   // 65–100 → high (spoofed)

// ── Risk band colors ─────────────────────────────────────────────────
export const COLOR_LOW       = '#FAF4EB'  // Light Cream
export const COLOR_UNCERTAIN = '#F4E3D3'  // Pale Peach
export const COLOR_MEDIUM    = '#EDCDB1'  // Peach/Tan
export const COLOR_HIGH      = '#C48A66'  // Darker, intense rust/peach for high risk
export const COLOR_MUTED     = 'rgba(244, 227, 211, 0.18)'

// ── Demo simulation sequence ───────────────────────────────────────────────
// Spoof probabilities (0–1) played back during demo / offline mode.
// Designed to show the full range: low → high → recovery.
export const DEMO_SEQUENCE = [
  0.12, 0.18, 0.28, 0.45, 0.62,
  0.75, 0.81, 0.68, 0.52, 0.38,
  0.24, 0.15,
]
export const DEMO_INTERVAL_MS = 1200

// ── Feature attribution keys (must match server RiskEvent signals dict) ────
export const SIGNAL_FEATURES = [
  { label: 'Spectral Artifact',     key: 'spectral_artifact_score' },
  { label: 'Prosody Irregularity',  key: 'prosody_irregularity_score' },
  { label: 'GAN Artifacts',         key: 'gan_artifact_score' },
  { label: 'F0 Trajectory',         key: 'f0_trajectory_score' },
  { label: 'Phase Coherence',       key: 'phase_coherence_score' },
  { label: 'Caller Context',        key: 'caller_context_score' },
  { label: 'Transaction Risk',      key: 'transaction_context_score' },
]

// ── Chart / history limits ─────────────────────────────────────────────────
export const HISTORY_MAX_WINDOWS = 40
export const EVENT_LOG_MAX       = 30
export const CALL_HISTORY_MAX    = 50

// ── Waveform ───────────────────────────────────────────────────────────────
export const WAVEFORM_BARS = 48

// ── Audio ──────────────────────────────────────────────────────────────────
export const MIC_SAMPLE_RATE    = 16000
export const MIC_BUFFER_SIZE    = 4096
export const ALERT_MEDIUM_PROB  = 0.3   // probability of showing medium-risk alert
