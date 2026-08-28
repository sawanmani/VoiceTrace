import { useState, useCallback, useRef } from 'react'
import { genCallId } from '../lib/utils'
import { WS_BASE, MIC_SAMPLE_RATE, MIC_BUFFER_SIZE, DEMO_SEQUENCE, DEMO_INTERVAL_MS, THRESHOLD_HIGH, THRESHOLD_MEDIUM, THRESHOLD_UNCERTAIN } from '../lib/constants'

export function useMicStream(onEvent, finalizeCall) {
  const [active, setActive] = useState(false)
  const [callId, setCallId] = useState(null)
  
  const callWsRef = useRef(null)
  const micRef = useRef(null)
  const processorRef = useRef(null)
  const audioCtxRef = useRef(null)
  const callStartRef = useRef(null)
  
  const demoRef = useRef(null)
  const _demoIdx = useRef(0)

  const _startDemo = useCallback((id) => {
    _demoIdx.current = 0
    demoRef.current = setInterval(() => {
      const base = DEMO_SEQUENCE[_demoIdx.current % DEMO_SEQUENCE.length] + (Math.random() - 0.5) * 0.06
      const clamped = Math.max(0, Math.min(1, base))
      const score = Math.round(clamped * 100)
      const band = score >= THRESHOLD_HIGH ? 'high'
                 : score >= THRESHOLD_MEDIUM ? 'medium'
                 : score >= THRESHOLD_UNCERTAIN ? 'uncertain'
                 : 'low'
      
      onEvent({
        risk_score: score,
        band,
        signals: {
          spectral_artifact_score: Math.min(1, clamped + (Math.random() - 0.5) * 0.2),
          prosody_irregularity_score: Math.min(1, clamped + (Math.random() - 0.5) * 0.25),
          gan_artifact_score: Math.min(1, clamped * 1.1 + (Math.random() - 0.5) * 0.15),
          f0_trajectory_score: Math.min(1, clamped + (Math.random() - 0.5) * 0.3),
          phase_coherence_score: Math.min(1, clamped * 0.9 + (Math.random() - 0.5) * 0.2),
          liveness_score: Math.max(0, 0.85 - clamped * 0.6),
          caller_context_score: 0.3,
          transaction_context_score: 0.5,
        },
        recommendation: band === 'high'
          ? 'HIGH RISK: Recommend callback verification before approving any transfer.'
          : band === 'medium'
            ? 'Borderline signal detected. Request additional identity verification.'
            : 'Voice appears genuine. No action required.',
        call_id: id,
        window_index: _demoIdx.current,
        latency_ms: 28 + Math.random() * 40,
      })
      _demoIdx.current++
    }, DEMO_INTERVAL_MS)
  }, [onEvent])

  const startMic = useCallback(async () => {
    const id = genCallId()
    setCallId(id)
    callStartRef.current = Date.now()

    // Open call WebSocket
    const ws = new WebSocket(`${WS_BASE}/ws/call/${id}`)
    callWsRef.current = ws
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data)) } catch (_) {}
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new window.AudioContext({ sampleRate: MIC_SAMPLE_RATE })
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      micRef.current = stream

      // NOTE: ScriptProcessor is deprecated but widely supported.
      // Future: replace with AudioWorklet for better performance and no deprecation warning.
      const proc = ctx.createScriptProcessor(MIC_BUFFER_SIZE, 1, 1)
      processorRef.current = proc

      proc.onaudioprocess = (e) => {
        const pcm = e.inputBuffer.getChannelData(0)
        if (ws.readyState === WebSocket.OPEN) {
          // Use byteOffset + byteLength to correctly slice SharedArrayBuffer views
          ws.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength))
        }
      }

      source.connect(proc)
      // Route to a muted GainNode instead of ctx.destination to prevent
      // microphone audio being played back through speakers (feedback loop).
      const muteNode = ctx.createGain()
      muteNode.gain.value = 0
      proc.connect(muteNode)
      muteNode.connect(ctx.destination)
      setActive(true)
    } catch (err) {
      // Close the WS opened above if mic fails, then fallback to demo
      if (ws.readyState !== WebSocket.CLOSED) ws.close()
      callWsRef.current = null
      console.warn('Mic unavailable — starting demo mode:', err.message)
      setActive(true)
      _startDemo(id)
    }
  }, [onEvent, _startDemo])

  const stopMic = useCallback(() => {
    micRef.current?.getTracks().forEach(t => t.stop())
    micRef.current = null
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null

    callWsRef.current?.close()
    callWsRef.current = null
    
    clearInterval(demoRef.current)

    const durationSec = callStartRef.current ? (Date.now() - callStartRef.current) / 1000 : 0
    if (callId) {
      finalizeCall(callId, durationSec)
    }

    setActive(false)
    setCallId(null)
  }, [callId, finalizeCall])

  return { active, startMic, stopMic }
}
