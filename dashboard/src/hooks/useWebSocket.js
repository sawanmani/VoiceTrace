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
    // null URL = intentionally disconnected (e.g. mic call is active)
    if (!mountedRef.current || !url) return

    try {
      const apiKey = import.meta.env.VITE_API_KEY ?? ''
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        
        // Send the auth handshake required by the new backend
        if (apiKey) {
          ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }))
        }
        
        setConnected(true)
        setReconnecting(false)
        retryDelay.current = 1000
      }

      ws.onclose = (ev) => {
        if (!mountedRef.current) return
        setConnected(false)
        wsRef.current = null
        // Don't reconnect on auth rejection (1008) — would infinite loop
        if (ev.code === 1008) {
          console.error('WebSocket auth rejected (1008). Check VITE_API_KEY.')
          return
        }
        // Exponential backoff reconnect (max 10s)
        const delay = Math.min(retryDelay.current, 10000)
        retryDelay.current = delay * 1.5
        setReconnecting(true)
        retryRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        // Do NOT call ws.close() here — browser fires onclose automatically
        // after onerror. Calling close() here causes duplicate onclose events
        // which leads to double reconnect timers.
      }

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return
        try {
          const data = JSON.parse(ev.data)
          // Pass all messages through, store/worker handles filtering
          // if (data.type && data.type !== 'risk_event') return
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
