import { getRiskColor, getRiskLabel, getBandClass } from '../lib/utils'

export default function RiskGauge({ score }) {
  const r = 80
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = getRiskColor(score)
  const level = getBandClass(score)

  return (
    <div className={`card gauge-card risk-${level}`}>
      <p className="gauge-title">Spoof Risk Score</p>
      <div className="gauge-ring-wrapper">
        <svg className="gauge-svg" viewBox="0 0 180 180">
          <circle className="gauge-track" cx="90" cy="90" r={r} />
          <circle
            className="gauge-fill" cx="90" cy="90" r={r}
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
          />
        </svg>
        <div className="gauge-center">
          <div className="gauge-value" style={{ color }}>{score}</div>
          <div className="gauge-unit">/ 100</div>
        </div>
      </div>
      <div className="gauge-label" style={{ color }}>{getRiskLabel(score)}</div>
      <div className="gauge-sublabel">AASIST-L · EMA smoothed</div>
    </div>
  )
}
