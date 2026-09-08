import { Activity } from 'lucide-react';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../lib/constants';

function bandColor(score) {
  if (score >= THRESHOLD_HIGH) return '#ef4444';
  if (score >= THRESHOLD_MEDIUM) return '#f59e0b';
  return '#10b981';
}

function bandLabel(score) {
  if (score >= THRESHOLD_HIGH) return 'HIGH';
  if (score >= THRESHOLD_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

export default function CallRiskDisplay({ riskEvent, windowCount }) {
  if (!riskEvent) {
    return (
      <div style={{ padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 16, textAlign: 'center' }}>
        <Activity size={20} style={{ marginBottom: 8, opacity: 0.3 }} />
        <div>Waiting for analysis...</div>
        <div style={{ marginTop: 4, fontSize: 15 }}>Voice detection starts after ~1 second of audio</div>
      </div>
    );
  }

  const { risk_score, band, signals, recommendation, latency_ms } = riskEvent;

  const topSignals = Object.entries(signals || {})
    .filter(([k]) => !k.includes('context'))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Score */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 44, fontWeight: 900, letterSpacing: '-0.02em',
          color: bandColor(risk_score), lineHeight: 1,
          textShadow: `0 0 30px ${bandColor(risk_score)}55`,
        }}>
          {risk_score}
        </div>
        <div style={{
          fontSize: 14, fontWeight: 800, letterSpacing: '0.15em',
          color: bandColor(risk_score), textTransform: 'uppercase', marginTop: 4,
        }}>
          {bandLabel(risk_score)} RISK
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
          Window #{windowCount} · {Math.round(latency_ms)}ms
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          width: `${risk_score}%`,
          background: `linear-gradient(90deg, #10b981, ${bandColor(risk_score)})`,
          transition: 'width 0.5s, background 0.4s',
        }} />
      </div>

      {/* Sub-scores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2 }}>
          Signal Breakdown
        </div>
        {topSignals.map(([key, val]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                {key.replace(/_score$/, '').replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                {Math.round(val * 100)}%
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }}>
              <div style={{
                height: '100%', borderRadius: 3, background: bandColor(risk_score),
                width: `${val * 100}%`, transition: 'width 0.5s',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, padding: '8px 10px',
        fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
      }}>
        {recommendation}
      </div>
    </div>
  );
}
