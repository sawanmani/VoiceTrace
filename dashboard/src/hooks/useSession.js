import { useState, useCallback, useRef, useEffect } from 'react'
import { formatTime } from '../lib/utils'
import { HISTORY_MAX_WINDOWS, EVENT_LOG_MAX, ALERT_MEDIUM_PROB, THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../lib/constants'

export function useSession() {
  const [riskScore, setRiskScore] = useState(0)
  const [signals, setSignals] = useState({})
  const [liveness, setLiveness] = useState(null)
  const [history, setHistory] = useState([])
  const [events, setEvents] = useState([])
  const [sessionCount, setSessionCount] = useState(0)
  const [highRiskCount, setHighRiskCount] = useState(0)
  const [latency, setLatency] = useState(null)
  const [alertEvent, setAlertEvent] = useState(null)
  const [completedCall, setCompletedCall] = useState(null)

  const peakRiskRef = useRef(0)
  const windowCountRef = useRef(0)

  const handleEvent = useCallback((data) => {
    const score = data.risk_score ?? 0
    const band = data.band ?? 'low'

    setRiskScore(score)
    setSignals(data.signals ?? {})
    setLiveness(data.signals?.liveness_score ?? null)
    setLatency(data.latency_ms)
    setSessionCount(c => c + 1)
    windowCountRef.current += 1

    if (score > peakRiskRef.current) peakRiskRef.current = score

    if (score >= THRESHOLD_HIGH) {
      setHighRiskCount(c => c + 1)
      setAlertEvent({ ...data, timestamp: Date.now() })
    } else if (score >= THRESHOLD_MEDIUM && Math.random() < ALERT_MEDIUM_PROB) {
      setAlertEvent({ ...data, timestamp: Date.now() })
    }

    const t = formatTime(new Date())
    const messages = {
      low: ['Genuine voice detected', 'Speaker verified', 'Natural speech confirmed'],
      medium: ['Borderline signal — monitoring', 'Ambiguous pattern detected'],
      high: ['⚠ Clone signature detected', '🚨 High spoof probability', 'AI-generated voice suspected'],
    }
    const msgList = messages[band] || messages.low
    const msg = msgList[Math.floor(Math.random() * msgList.length)]

    setHistory(h => [...h, { t: t.slice(3), score }].slice(-HISTORY_MAX_WINDOWS))
    setEvents(ev => [{
      message: msg, time: t, band, score: score / 100,
      risk_score: score, latency_ms: data.latency_ms,
      call_id: data.call_id, window_index: data.window_index
    }, ...ev].slice(0, EVENT_LOG_MAX))
  }, [])

  const resetSession = useCallback(() => {
    peakRiskRef.current = 0
    windowCountRef.current = 0
    setHistory([])
    setEvents([])
    setSessionCount(0)
    setHighRiskCount(0)
    setRiskScore(0)
    setSignals({})
    setLiveness(null)
    setLatency(null)
    setAlertEvent(null)
    setCompletedCall(null)
  }, [])

  const finalizeCall = useCallback((callId, durationSec) => {
    setCompletedCall({
      call_id: callId || 'call-unknown',
      peak_risk: peakRiskRef.current,
      band: peakRiskRef.current >= THRESHOLD_HIGH ? 'high' : peakRiskRef.current >= THRESHOLD_MEDIUM ? 'medium' : 'low',
      windows: windowCountRef.current,
      duration_sec: durationSec,
      time: formatTime(new Date()),
      completed: true,
    })
  }, [])

  return {
    state: {
      riskScore, signals, liveness, history, events, sessionCount, 
      highRiskCount, latency, alertEvent, completedCall
    },
    actions: {
      handleEvent, resetSession, finalizeCall, setAlertEvent
    },
    refs: { peakRiskRef, windowCountRef }
  }
}
