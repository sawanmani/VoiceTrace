import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export default function FeedbackPanel({ callId }) {
  const [status, setStatus] = useState(null);

  const submitFeedback = async (label) => {
    if (!callId) {
      setStatus('No active call');
      return;
    }
    try {
      setStatus('Sending...');
      const res = await fetch('http://localhost:8000/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId, label })
      });
      if (res.ok) {
        setStatus('Thanks!');
      } else {
        setStatus('Error');
      }
    } catch (e) {
      console.error(e);
      setStatus('Error');
    }
    setTimeout(() => setStatus(null), 3000);
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>Feedback Loop & Active Learning</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
        {status && <div style={{ fontSize: 12, color: 'var(--accent-rust)', fontWeight: 700 }}>{status}</div>}
        <button 
          onClick={() => submitFeedback("genuine")}
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '12px 24px', cursor: 'pointer', width: '100%', maxWidth: 250 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>CORRECT DETECTOR?</div>
          <div className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold inline-block uppercase mt-1">This is genuine</div>
        </button>
        <button 
          onClick={() => submitFeedback("spoof")}
          style={{ background: 'var(--bg-base)', border: '1px solid var(--accent-rust)', borderRadius: 4, padding: '12px 24px', cursor: 'pointer', width: '100%', maxWidth: 250 }}>
          <div className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[11px] font-bold inline-block uppercase">Flag Missed Spoof</div>
        </button>
      </div>
    </div>
  );
}
