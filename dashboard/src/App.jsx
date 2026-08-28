import { useState, useEffect, useCallback } from 'react'
import { formatTime } from './lib/utils'
import { WS_BASE } from './lib/constants'
import { useWebSocket } from './hooks/useWebSocket'
import { useSession } from './hooks/useSession'
import { useMicStream } from './hooks/useMicStream'

import AlertCard from './components/AlertCard'
import CallHistory from './components/CallHistory'
import RiskGauge from './components/RiskGauge'
import Waveform from './components/Waveform'
import Metrics from './components/Metrics'
import ScoreChart from './components/ScoreChart'
import Explainability from './components/Explainability'
import EventLog from './components/EventLog'
import FileUpload from './components/FileUpload'

export default function App() {
  const [now, setNow] = useState(new Date())

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Session state
  const { state, actions } = useSession()

  // WS connection for scores
  const { connected, reconnecting } = useWebSocket(
    `${WS_BASE}/ws/score`,
    actions.handleEvent,
  )

  // Mic streaming
  const { active, startMic, stopMic } = useMicStream(
    actions.handleEvent, 
    actions.finalizeCall
  )

  const handleClear = useCallback(() => {
    stopMic()
    actions.resetSession()
  }, [stopMic, actions])

  const handleFileResults = useCallback((data) => {
    const windows = data.windows || []
    windows.forEach((w, i) => {
      setTimeout(() => actions.handleEvent(w), i * 200)
    })
  }, [actions])

  const backendStatus = connected ? '🟢 Connected' : reconnecting ? '🟡 Reconnecting…' : '🔴 Offline'

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <div className="brand-icon">🎙</div>
          <span className="brand-name">VoiceTrace</span>
          <span className="brand-tag">SIH 2026 · PS 104</span>
        </div>
        <div className="header-status">
          <div className={`status-pill ${active ? 'live' : 'idle'}`}>
            <div className="status-dot" />
            {active ? 'LIVE DETECTION' : 'IDLE'}
          </div>
          <div className="header-time">{formatTime(now)}</div>
        </div>
      </header>

      {state.alertEvent && (state.alertEvent.band === 'high' || state.alertEvent.band === 'medium') && (
        <AlertCard event={state.alertEvent} onDismiss={() => actions.setAlertEvent(null)} />
      )}

      <main className="main">
        <div className="col-left">
          <RiskGauge score={state.riskScore} />
          <Waveform active={active} score={state.riskScore} />
          <Explainability signals={state.signals} />

          <div className="card controls-card">
            <div className="card-header"><span className="card-title">Controls</span></div>
            <div className="controls-row">
              {!active ? (
                <button id="btn-start" className="btn btn-primary" onClick={startMic}>
                  🎙 Start Detection
                </button>
              ) : (
                <button id="btn-stop" className="btn btn-danger" onClick={stopMic}>
                  ■ Stop
                </button>
              )}
              <button id="btn-clear" className="btn btn-ghost" onClick={handleClear}>
                ↺ Clear
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <FileUpload onResults={handleFileResults} disabled={active} />
            </div>
            {!connected && (
              <div className="banner warning" style={{ marginTop: 12 }}>
                <span>⚠</span>
                <span>Backend offline — running demo mode. Start FastAPI server on port 8000.</span>
              </div>
            )}
          </div>
        </div>

        <div className="col-right">
          <Metrics
            score={state.riskScore}
            sessionCount={state.sessionCount}
            highRiskCount={state.highRiskCount}
            latency={state.latency}
            liveness={state.liveness}
          />
          <ScoreChart history={state.history} />
          <EventLog events={state.events} />
          <CallHistory currentCall={state.completedCall} />
        </div>
      </main>

      <footer className="footer">
        <div className="footer-left">
          VoiceTrace · Team VoiceTracers · PSID 260104 · AASIST-L model
        </div>
        <div className="footer-right">
          <span>Model: AASIST-L (~85K params)</span>
          <div className="footer-sep" />
          <span>Backend: {backendStatus}</span>
          <div className="footer-sep" />
          <span>Windows: {state.sessionCount}</span>
        </div>
      </footer>
    </div>
  )
}
