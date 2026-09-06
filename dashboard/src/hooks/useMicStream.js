import { useState, useCallback, useRef } from 'react'
import { genCallId } from '../lib/utils'
import { WS_BASE, MIC_SAMPLE_RATE, MIC_BUFFER_SIZE } from '../lib/constants'

export function useMicStream(onEvent, finalizeCall) {
  const [active, setActive] = useState(false)
  const [callId, setCallId] = useState(null)
  const [error, setError] = useState(null)
  
  const callWsRef = useRef(null)
  const micRef = useRef(null)
  const processorRef = useRef(null)
  const audioCtxRef = useRef(null)
  const callStartRef = useRef(null)

  const startMic = useCallback(async () => {
    setError(null)
    const id = genCallId()
    setCallId(id)
    callStartRef.current = Date.now()

    // Open call WebSocket (no ?api_key= in wsUrl anymore)
    const apiKey = import.meta.env.VITE_API_KEY ?? ''
    const ws = new WebSocket(`${WS_BASE}/ws/call/${id}`)
    callWsRef.current = ws
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }))
    }
    
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data)) } catch (_) {}
    }
    
    ws.onerror = (err) => {
      console.error("WebSocket transport error:", err)
    }
    
    ws.onclose = (ev) => {
      if (ev.code === 1008) {
        console.error('WebSocket auth rejected (1008). Check VITE_API_KEY.')
        setError('Connection failed — check API key.')
        setActive(false)
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new window.AudioContext({ sampleRate: MIC_SAMPLE_RATE })
      audioCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      micRef.current = stream

      // Modern AudioWorklet instead of deprecated ScriptProcessor
      await ctx.audioWorklet.addModule('/pcm-processor.js')
      const proc = new window.AudioWorkletNode(ctx, 'pcm-processor')
      processorRef.current = proc

      proc.port.onmessage = (e) => {
        const pcm = e.data
        if (ws.readyState === WebSocket.OPEN) {
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
      // Close the WS opened above if mic fails
      if (ws.readyState !== WebSocket.CLOSED) ws.close()
      callWsRef.current = null
      console.error('Mic unavailable:', err.message)
      setError('Connection failed — check API key or microphone permissions.')
      setActive(false)
    }
  }, [onEvent, finalizeCall])

  const stopMic = useCallback(() => {
    micRef.current?.getTracks().forEach(t => t.stop())
    micRef.current = null
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null

    callWsRef.current?.close()
    callWsRef.current = null
    
    const durationSec = callStartRef.current ? (Date.now() - callStartRef.current) / 1000 : 0
    if (callId) {
      finalizeCall(callId, durationSec)
    }

    setActive(false)
    setCallId(null)
  }, [callId, finalizeCall])

  return { active, startMic, stopMic, error }
}
