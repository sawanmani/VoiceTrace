import { MoreHorizontal } from 'lucide-react';

export default function FeedbackPanel() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>Feedback Loop & Active Learning</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>
      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <button style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '12px 24px', cursor: 'pointer', width: '100%', maxWidth: 250 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>CORRECT DETECTOR?</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>[cite: This is genuine]</div>
          <div style={{ fontSize: 11, color: 'var(--accent-rust)', fontWeight: 600, marginTop: 4 }}>[cite: Flag Missed Spoof]</div>
        </button>
      </div>
    </div>
  );
}
