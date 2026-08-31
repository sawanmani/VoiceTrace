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
  const [recentCalls, setRecentCalls] = useState([])

  const peakRiskRef = useRef(0)
  const windowCountRef = useRef(0)

  const handleEvent = useCallback((data) => {
    if (data.type === 'challenge_audio') {
      // Could play audio here or just update state, but useSession is mainly for demo
      return
    }
    if (data.type && data.type !== 'risk_event') return

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
      low:      ['Genuine voice detected', 'Speaker verified', 'Natural speech confirmed'],
      uncertain: ['Borderline — monitoring closely', 'Ambiguous pattern, continuing analysis'],
      medium:   ['Borderline signal — monitoring', 'Ambiguous pattern detected'],
      high:     ['\u26a0 Clone signature detected', '\U0001f6a8 High spoof probability', 'AI-generated voice suspected'],
    }
    const msgList = messages[band] ?? messages.low
    // Use window_index for deterministic selection (avoids Math.random in render)
    const msg = msgList[(data.window_index ?? 0) % msgList.length]

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
    setRecentCalls([])
  }, [])

  const finalizeCall = useCallback((callId, durationSec) => {
    const peak = peakRiskRef.current
    const band = peak >= THRESHOLD_HIGH ? 'high'
               : peak >= THRESHOLD_MEDIUM ? 'medium'
               : peak >= (THRESHOLD_MEDIUM / 2) ? 'uncertain'
               : 'low'
    
    const callData = {
      call_id: callId || `call-${Math.floor(Math.random() * 10000)}`,
      peak_risk: peak,
      band,
      windows: windowCountRef.current,
      duration_sec: durationSec,
      time: formatTime(new Date()),
      completed: true,
    }
    
    setCompletedCall(callData)
    setRecentCalls(prev => [callData, ...prev].slice(0, 50))
  }, [])

  return {
    state: {
      riskScore, signals, liveness, history, events, sessionCount, 
      highRiskCount, latency, alertEvent, completedCall, recentCalls
    },
    actions: {
      handleEvent, resetSession, finalizeCall, setAlertEvent
    },
    refs: { peakRiskRef, windowCountRef }
  }
}
