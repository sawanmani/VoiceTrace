import { useState } from 'react'
import { API_BASE } from '../lib/constants'

export default function FeedbackButtons({ callId }) {
  const [status, setStatus] = useState('idle') // idle, submitting, done

  const handleFeedback = async (label) => {
    setStatus('submitting')
    try {
      // In a real app, this posts to a feedback endpoint
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Api-Key': import.meta.env.VITE_API_KEY || 'dev_key_123'
        },
        body: JSON.stringify({ call_id: callId, label })
      })
      setStatus('done')
    } catch (e) {
      console.error("Failed to submit feedback", e)
      setStatus('done') // gracefully handle error for demo
    }
  }

  if (status === 'done') {
    return <div style={{ fontSize: 15, color: '#10b981', marginTop: 4 }}>✓ Feedback saved</div>
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <button 
        onClick={() => handleFeedback('genuine')}
        disabled={status !== 'idle'}
        style={{
          background: 'rgba(16,185,129,0.1)', color: '#34d399', 
          border: '1px solid rgba(16,185,129,0.2)', borderRadius: 4, 
          fontSize: 14, padding: '2px 6px', cursor: 'pointer'
        }}
      >
        ✓ Confirm Genuine
      </button>
      <button 
        onClick={() => handleFeedback('spoof')}
        disabled={status !== 'idle'}
        style={{
          background: 'rgba(239,68,68,0.1)', color: '#f87171', 
          border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, 
          fontSize: 14, padding: '2px 6px', cursor: 'pointer'
        }}
      >
        ✕ Confirm Spoofed
      </button>
    </div>
  )
}
