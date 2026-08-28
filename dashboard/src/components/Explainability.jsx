import { SIGNAL_FEATURES, COLOR_HIGH, COLOR_MEDIUM, COLOR_LOW } from '../lib/constants'

export default function Explainability({ signals }) {
  return (
    <div className="card explain-card">
      <div className="card-header">
        <span className="card-title">Feature Attribution</span>
        <span className="card-badge" style={{
          background: 'rgba(139,92,246,0.1)', color: '#a78bfa',
          border: '1px solid rgba(139,92,246,0.25)',
        }}>AASIST-L</span>
      </div>
      <div className="explain-list">
        {SIGNAL_FEATURES.map(f => {
          const pct = signals?.[f.key] ?? 0
          const color = pct > 0.65 ? COLOR_HIGH : pct > 0.35 ? COLOR_MEDIUM : COLOR_LOW
          return (
            <div key={f.key} className="explain-item">
              <div className="explain-row">
                <span className="explain-feature">{f.label}</span>
                <span className="explain-pct" style={{ color }}>{(pct * 100).toFixed(0)}%</span>
              </div>
              <div className="explain-bar-track">
                <div className="explain-bar-fill"
                  style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}90, ${color})` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
