import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useWebSocket — manages a WebSocket connection to the VoiceTrace backend.
 *
 * Handles:
 *   - Initial connection + reconnection (exponential backoff)
 *   - Incoming RiskEvent JSON parsing
 *   - Binary audio frame sending (for mic streaming)
 *   - Call context JSON sending
 *   - Clean teardown on unmount
 *
 * @param {string} url        WebSocket URL
 * @param {function} onEvent  Called with each parsed RiskEvent object
 * @returns {{ send, sendAudio, sendContext, connected, reconnecting }}
 */
export function useWebSocket(url, onEvent) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const wsRef = useRef(null)
  const retryRef = useRef(null)
  const retryDelay = useRef(1000)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setConnected(true)
        setReconnecting(false)
        retryDelay.current = 1000
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        wsRef.current = null
        // Exponential backoff reconnect (max 10s)
        const delay = Math.min(retryDelay.current, 10000)
        retryDelay.current = delay * 1.5
        setReconnecting(true)
        retryRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return
        try {
          const data = JSON.parse(ev.data)
          onEvent(data)
        } catch (_) { /* not JSON */ }
      }
    } catch (_) {
      // WebSocket not available or URL invalid — stay disconnected
    }
  }, [url, onEvent])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text)
    }
  }, [])

  const sendAudio = useCallback((arrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(arrayBuffer)
    }
  }, [])

  const sendContext = useCallback((callerFamiliarity, transactionRisk) => {
    send(JSON.stringify({
      type: 'context',
      caller_familiarity: callerFamiliarity,
      transaction_risk: transactionRisk,
    }))
  }, [send])

  return { send, sendAudio, sendContext, connected, reconnecting }
}
