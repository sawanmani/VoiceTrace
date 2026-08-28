import { getRiskColor } from '../lib/utils'

export default function Metrics({ score, sessionCount, highRiskCount, latency, liveness }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Session Metrics</span></div>
      <div className="metrics-grid">
        <div className="metric-item">
          <div className="metric-label">Risk Score</div>
          <div className="metric-value" style={{ color: getRiskColor(score) }}>{score}</div>
          <div className="metric-delta">current window</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Inferences</div>
          <div className="metric-value blue">{sessionCount}</div>
          <div className="metric-delta">this session</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">High Risk</div>
          <div className="metric-value red">{highRiskCount}</div>
          <div className="metric-delta">alerts fired</div>
        </div>
        <div className="metric-item">
          <div className="metric-label">Latency</div>
          <div className="metric-value yellow">{latency ? `${latency.toFixed(0)}ms` : '—'}</div>
          <div className="metric-delta">inference time</div>
        </div>
        <div className="metric-item" style={{ gridColumn: '1/-1' }}>
          <div className="metric-label">Liveness Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div style={{
              flex: 1, height: 8, background: 'rgba(255,255,255,0.05)',
              borderRadius: 4, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${(liveness ?? 0.5) * 100}%`,
                background: `linear-gradient(90deg, #10b981, #06b6d4)`,
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 13, fontWeight: 600, color: '#34d399', minWidth: 36,
            }}>
              {liveness != null ? `${(liveness * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
          <div className="metric-delta" style={{ marginTop: 4 }}>microphone vs. replay heuristics</div>
        </div>
      </div>
    </div>
  )
}
