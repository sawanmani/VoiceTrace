import { useState, useEffect } from 'react'
import { getRiskColor, formatDuration } from '../lib/utils'
import { CALL_HISTORY_MAX } from '../lib/constants'

const STORAGE_KEY = 'voicetrace_call_history'

/**
 * CallHistory — persists and displays a list of completed call summaries.
 *
 * Each entry stores: call_id, peak_risk, band, verdict, duration, time.
 * Persisted in localStorage so it survives page reloads.
 *
 * @param {object} currentCall  — active call summary object (null when idle)
 */
export default function CallHistory({ currentCall }) {
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
      return []
    }
  })
  const [collapsed, setCollapsed] = useState(false)

  // Save to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  }, [history])

  // When a call completes (currentCall changes from non-null to null), save it
  useEffect(() => {
    if (currentCall?.completed && currentCall.call_id) {
      setHistory(prev => {
        // Prevent duplicate appending of the same call ID
        if (prev.some(c => c.call_id === currentCall.call_id)) {
          return prev
        }
        const next = [currentCall, ...prev].slice(0, CALL_HISTORY_MAX)
        return next
      })
    }
  }, [currentCall])

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear the call history?')) {
      setHistory([])
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <div className="card history-card">
      <div className="card-header">
        <span className="card-title">Call History</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="card-badge" style={{
            background: 'rgba(148,163,184,0.06)',
            color: '#64748b',
            border: '1px solid rgba(148,163,184,0.1)',
          }}>
            {history.length} calls
          </span>
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{
              background: 'none', border: 'none', color: '#475569',
              cursor: 'pointer', fontSize: 14, padding: '2px 4px',
            }}
          >
            {collapsed ? '▼' : '▲'}
          </button>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              style={{
                background: 'none', border: 'none', color: '#475569',
                cursor: 'pointer', fontSize: 11, padding: '2px 4px',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="history-list">
          {history.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              Completed calls will appear here.
            </div>
          )}
          {history.map((call, i) => (
            <div key={call.call_id || `history-${i}`} className="history-item">
              <div className="history-band-dot" style={{ background: getRiskColor(call.peak_risk) }} />
              <div className="history-content">
                <div className="history-id">{call.call_id}</div>
                <div className="history-meta">
                  {call.time} · {call.windows} windows · {formatDuration(call.duration_sec)}
                </div>
              </div>
              <div className="history-score" style={{ color: getRiskColor(call.peak_risk) }}>
                {call.peak_risk}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
