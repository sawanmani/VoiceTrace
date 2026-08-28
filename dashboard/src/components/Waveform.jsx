import { getRiskColor } from '../lib/utils'
import { WAVEFORM_BARS, COLOR_MUTED } from '../lib/constants'

export default function Waveform({ active, score }) {
  const color = getRiskColor(score)
  return (
    <div className="card waveform-card">
      <div className="card-header">
        <span className="card-title">Live Waveform</span>
        <span className="card-badge" style={{
          background: active ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.08)',
          color: active ? '#34d399' : '#64748b',
          border: `1px solid ${active ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.15)'}`,
        }}>
          {active ? '● REC' : '○ IDLE'}
        </span>
      </div>
      <div className="waveform-bars">
        {Array.from({ length: WAVEFORM_BARS }).map((_, i) => (
          <div
            key={i}
            className={`waveform-bar ${active ? 'animate' : ''}`}
            style={{
              height: active ? undefined : `${12 + Math.abs(Math.sin(i * 0.4)) * 16}%`,
              minHeight: 4,
              background: active ? color : COLOR_MUTED,
              '--dur': `${0.4 + (i % 7) * 0.08}s`,
              '--delay': `${(i * 0.03) % 0.5}s`,
              opacity: active ? 0.8 : 0.35,
            }}
          />
        ))}
      </div>
    </div>
  )
}
