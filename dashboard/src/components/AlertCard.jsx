import { useEffect, useState } from 'react'
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../lib/constants'

/**
 * AlertCard — full-width high-risk banner.
 *
 * Appears when risk_score >= threshold (default 65).
 * Auto-dismisses after dismissTimeout. Manual dismiss button.
 * Shows the recommendation text from the server.
 */
export default function AlertCard({ event, onDismiss, dismissTimeout = 10000 }) {
  const [visible, setVisible] = useState(true)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (!event) return
    setVisible(true)
    setProgress(100)

    const start = Date.now()
    let animationFrame
    
    const tick = () => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / dismissTimeout) * 100)
      setProgress(pct)
      if (pct <= 0) {
        setVisible(false)
        onDismiss?.()
      } else {
        animationFrame = requestAnimationFrame(tick)
      }
    }
    
    animationFrame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animationFrame)
  }, [event]) // Depend on the whole event object

  if (!visible || !event) return null

  // We rely on the server's band if present, else fallback
  const band = event.band || (event.risk_score >= THRESHOLD_HIGH ? 'high' : event.risk_score >= THRESHOLD_MEDIUM ? 'medium' : 'low')
  const isMedium = band === 'medium'

  return (
    <div className="alert-card" data-band={band} role="alert" aria-live="assertive">
      <div className="alert-header">
        <div className="alert-icon">{isMedium ? '⚠️' : '🚨'}</div>
        <div className="alert-title">
          {isMedium ? 'CAUTION — Verification Required' : 'HIGH RISK — Potential Voice Clone Detected'}
        </div>
        <button className="alert-dismiss" onClick={() => { setVisible(false); onDismiss?.() }}>✕</button>
      </div>

      <p className="alert-recommendation">{event.recommendation}</p>

      <div className="alert-meta">
        <span className="alert-score-badge" data-band={band}>
          Risk Score: {event.risk_score}/100
        </span>
        <span className="alert-window">Window #{event.window_index + 1}</span>
        <span className="alert-latency">{event.latency_ms?.toFixed(0)}ms</span>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="alert-progress-track">
        <div className="alert-progress-fill" style={{ width: `${progress}%` }} data-band={band} />
      </div>
    </div>
  )
}
