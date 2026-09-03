export default function EventLog({ events }) {
  return (
    <div className="card log-card">
      <div className="card-header">
        <span className="card-title">Event Log</span>
        <span className="card-badge" style={{
          background: 'rgba(148,163,184,0.06)', color: '#64748b',
          border: '1px solid rgba(148,163,184,0.1)',
        }}>{events.length} events</span>
      </div>
      <div className="log-list">
        {events.length === 0 && (
          <div style={{ color: '#475569', fontSize: 17, textAlign: 'center', padding: '24px 0' }}>
            No events yet. Start a session to begin.
          </div>
        )}
        {events.map((e) => {
          const cls = e.band === 'high' ? 'red' : e.band === 'medium' ? 'yellow' : 'green'
          // Key based on call_id and window_index instead of array index
          const uniqueKey = `${e.call_id}-${e.window_index}`
          return (
            <div key={uniqueKey} className="log-item">
              <div className={`log-dot ${cls}`} />
              <div className="log-content">
                <div className="log-message">{e.message}</div>
                <div className="log-time">{e.time} · {e.latency_ms?.toFixed(0)}ms</div>
              </div>
              <div className={`log-score ${cls}`}>{e.risk_score ?? Math.round(e.score * 100)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
