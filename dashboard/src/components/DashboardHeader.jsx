import { Activity, PhoneCall, Radio, CheckSquare, Bell, HelpCircle, UserCircle } from 'lucide-react';

export default function DashboardHeader({ connected, active, sessionCount, onNewScan }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-card)',
      position: 'fixed',
      top: 0,
      left: '60px', /* Offset for sidebar */
      right: 0,
      zIndex: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-primary)' }}>
          VOICETRACE <span style={{ color: 'var(--accent-light-peach)', margin: '0 8px' }}>//</span> Real-Time AI Verification <span style={{ color: 'var(--accent-light-peach)', margin: '0 8px' }}>//</span> SIH 2026
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-base)', padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--accent-rust)' : '#ccc' }} />
            WEBSOCKET: {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </div>
          <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-rust)' }} />
            SYSTEM: OPTIMIZED
          </div>
          <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--accent-rust)' : '#ccc' }} />
            CALLS ACTIVE: {active ? 1 : 0}
          </div>
        </div>

        <button onClick={onNewScan} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + NEW SCAN
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Radio size={14} /> LIVE MONITOR
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <PhoneCall size={14} /> TELEPHONY BRIDGE
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, color: 'var(--text-primary)' }}>
          <CheckSquare size={18} style={{ cursor: 'pointer' }} />
          <Bell size={18} style={{ cursor: 'pointer' }} />
          <HelpCircle size={18} style={{ cursor: 'pointer' }} />
          <UserCircle size={18} style={{ cursor: 'pointer' }} />
        </div>
      </div>
    </div>
  );
}
