import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { getRiskColor, getRiskLabel } from '../lib/utils'
import { THRESHOLD_MEDIUM, THRESHOLD_HIGH } from '../lib/constants'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value ?? 0
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: getRiskColor(val), fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
        Risk: {val} — {getRiskLabel(val)}
      </div>
    </div>
  )
}

export default function ScoreChart({ history }) {
  return (
    <div className="card chart-card">
      <div className="card-header">
        <span className="card-title">Score History</span>
        <span className="card-badge" style={{
          background: 'rgba(59,130,246,0.1)', color: '#93c5fd',
          border: '1px solid rgba(59,130,246,0.2)',
        }}>
          Last {history.length} windows
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="t" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={THRESHOLD_HIGH} stroke="rgba(239,68,68,0.35)" strokeDasharray="4 2" label={{ value: 'HIGH', fill: '#ef444460', fontSize: 9 }} />
          <ReferenceLine y={THRESHOLD_MEDIUM} stroke="rgba(16,185,129,0.3)" strokeDasharray="4 2" label={{ value: 'LOW', fill: '#10b98160', fontSize: 9 }} />
          <Area type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2}
            fill="url(#riskGrad)" dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#111827', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
