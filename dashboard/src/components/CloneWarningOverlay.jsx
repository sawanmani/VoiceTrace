/**
 * dashboard/src/components/CloneWarningOverlay.jsx
 *
 * Truecaller-style risk banner rendered on top of the WebRTC call UI.
 *
 * States:
 *   green  — risk_score < THRESHOLD_MEDIUM (35): subtle badge, no animation
 *   yellow — THRESHOLD_MEDIUM (35) ≤ risk_score < THRESHOLD_HIGH (65): caution banner, dismissible
 *   red    — risk_score ≥ THRESHOLD_HIGH (65): persistent pulsing alert, non-dismissible
 *
 * Explainability: the banner shows the top-scoring signal sub-feature as the
 * reason. This directly addresses the SIH PS requirement for "actionable,
 * interpretable scores, not just a bare number."
 *
 * Design constraints:
 *   - Fixed overlay INSIDE the call container (not a page modal or toast)
 *   - Slides in from the top on first appearance
 *   - Pulses only on 'red' band (not on yellow/green — avoid alert fatigue)
 *   - Yellow auto-dismisses after OVERLAY_DISMISS_TIMEOUT_MS of low score
 */
import { useState, useEffect, useRef } from 'react';
import { ShieldX, ShieldAlert, ShieldCheck, X, AlertTriangle, Zap } from 'lucide-react';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM, OVERLAY_DISMISS_TIMEOUT_MS } from '../lib/constants';

// ── Signal labels ──────────────────────────────────────────────────────────
const SIGNAL_LABELS = {
  spectral_artifact_score:     'Spectral artifacts detected — possible AI synthesis',
  prosody_irregularity_score:  'Prosody irregularity — unnatural speech rhythm',
  gan_artifact_score:          'GAN artifacts — neural voice generator signature',
  f0_trajectory_score:         'Abnormal pitch trajectory — unnatural F0 curve',
  phase_coherence_score:       'Phase incoherence — microphone fingerprint mismatch',
  liveness_score:              'Low liveness signal — possible audio replay',
};

function _topSignal(signals) {
  if (!signals) return null;
  // Exclude context scores, keep only model sub-scores
  const modelKeys = Object.keys(SIGNAL_LABELS);
  let best = null;
  let bestVal = -1;
  for (const key of modelKeys) {
    const v = signals[key] ?? 0;
    if (v > bestVal) { bestVal = v; best = key; }
  }
  return best && bestVal > 0.1 ? { key: best, value: bestVal } : null;
}

// ── Band config ────────────────────────────────────────────────────────────
function _bandConfig(riskScore) {
  if (riskScore >= THRESHOLD_HIGH) {
    return {
      band: 'red',
      bg: 'linear-gradient(135deg, rgba(220,38,38,0.97) 0%, rgba(153,27,27,0.97) 100%)',
      border: '1px solid rgba(252,165,165,0.4)',
      icon: ShieldX,
      iconColor: '#fca5a5',
      titleColor: '#fff',
      textColor: 'rgba(255,255,255,0.9)',
      title: 'AI VOICE CLONE DETECTED',
      pulsing: true,
      dismissible: false,
    };
  }
  if (riskScore >= THRESHOLD_MEDIUM) {
    return {
      band: 'yellow',
      bg: 'linear-gradient(135deg, rgba(161,98,7,0.97) 0%, rgba(120,53,15,0.97) 100%)',
      border: '1px solid rgba(253,230,138,0.3)',
      icon: ShieldAlert,
      iconColor: '#fde68a',
      titleColor: '#fef3c7',
      textColor: 'rgba(254,243,199,0.85)',
      title: 'VOICE ANOMALY — CAUTION',
      pulsing: false,
      dismissible: true,
    };
  }
  return {
    band: 'green',
    bg: 'linear-gradient(135deg, rgba(6,78,59,0.95) 0%, rgba(6,95,70,0.95) 100%)',
    border: '1px solid rgba(110,231,183,0.3)',
    icon: ShieldCheck,
    iconColor: '#6ee7b7',
    titleColor: '#d1fae5',
    textColor: 'rgba(209,250,233,0.8)',
    title: 'VOICE VERIFIED',
    pulsing: false,
    dismissible: false,
  };
}

export default function CloneWarningOverlay({ riskScore = 0, signals = {}, latencyMs = null }) {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const dismissTimerRef = useRef(null);
  const prevBandRef = useRef('green');

  const cfg = _bandConfig(riskScore);
  const top = _topSignal(signals);

  // Slide-in animation when band first becomes non-green,
  // or when band escalates
  useEffect(() => {
    const prevBand = prevBandRef.current;
    prevBandRef.current = cfg.band;

    if (cfg.band === 'green') {
      // If we're back to green after a yellow, start dismiss timer
      if (dismissed) return;
      dismissTimerRef.current = setTimeout(() => {
        setAnimIn(false);
        setTimeout(() => setVisible(false), 300);
      }, OVERLAY_DISMISS_TIMEOUT_MS);
      return () => clearTimeout(dismissTimerRef.current);
    }

    // Show the banner for non-green
    clearTimeout(dismissTimerRef.current);
    if (!visible) {
      setVisible(true);
      requestAnimationFrame(() => setAnimIn(true));
    }
    // Re-show if dismissed but band escalated to red
    if (dismissed && cfg.band === 'red') {
      setDismissed(false);
    }
  }, [cfg.band, visible, dismissed]);

  const handleDismiss = () => {
    if (!cfg.dismissible) return;
    setDismissed(true);
    setAnimIn(false);
    setTimeout(() => setVisible(false), 300);
  };

  // Reset dismissed state if risk escalates
  useEffect(() => {
    if (riskScore >= THRESHOLD_HIGH && dismissed) {
      setDismissed(false);
      setVisible(true);
      requestAnimationFrame(() => setAnimIn(true));
    }
  }, [riskScore, dismissed]);

  if (!visible || dismissed) return null;

  const Icon = cfg.icon;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        padding: '0 12px',
        paddingTop: 8,
        transform: animIn ? 'translateY(0)' : 'translateY(-110%)',
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: cfg.bg,
          border: cfg.border,
          borderRadius: 12,
          boxShadow: cfg.band === 'red'
            ? '0 0 0 2px rgba(220,38,38,0.4), 0 8px 32px rgba(0,0,0,0.5)'
            : '0 4px 24px rgba(0,0,0,0.4)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          animation: cfg.pulsing ? 'vt-pulse-red 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {/* Icon */}
        <div style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={20} color={cfg.iconColor} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: cfg.titleColor,
              textTransform: 'uppercase',
            }}>
              {cfg.title}
            </span>
            {/* Risk score badge */}
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: cfg.titleColor,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              padding: '1px 7px',
              letterSpacing: '0.04em',
            }}>
              {riskScore}/100
            </span>
            {latencyMs != null && (
              <span style={{
                fontSize: 10,
                color: cfg.textColor,
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 4,
                padding: '1px 5px',
              }}>
                <Zap size={9} style={{ display: 'inline', marginRight: 2 }} />
                {Math.round(latencyMs)}ms
              </span>
            )}
          </div>

          {/* Explainability note */}
          {top && (
            <div style={{
              fontSize: 12,
              color: cfg.textColor,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}>
              <AlertTriangle size={11} />
              <span>{SIGNAL_LABELS[top.key] ?? top.key.replace(/_/g, ' ')}</span>
              <span style={{ opacity: 0.7 }}>({Math.round(top.value * 100)}%)</span>
            </div>
          )}

          {/* Red: explicit action recommendation */}
          {cfg.band === 'red' && (
            <div style={{
              marginTop: 6,
              fontSize: 11,
              fontWeight: 700,
              color: '#fca5a5',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6,
              padding: '4px 8px',
            }}>
              ⚠ Hang up and verify caller identity via a known number before proceeding.
            </div>
          )}
        </div>

        {/* Dismiss button (yellow only) */}
        {cfg.dismissible && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss warning"
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: cfg.textColor,
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
