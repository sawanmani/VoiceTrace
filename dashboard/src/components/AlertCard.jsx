import { AlertTriangle, X, Download, ShieldAlert, MoreHorizontal } from 'lucide-react';

export default function AlertCard({ event, onDismiss }) {
  if (!event) return null;

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>INCIDENT REPORT & ALERTS</h3>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Always active</div>
        </div>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>

      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: 12, position: 'relative' }}>
          <X size={16} style={{ position: 'absolute', top: 12, right: 12, cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={onDismiss} />
          
          <div style={{ background: '#EF4444', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <AlertTriangle size={16} color="#fff" />
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, letterSpacing: 0.5 }}>ALERT: CLONE SIGNATURE DETECTED.</div>
          
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Recommendation: Recommend callback on a known number before approving any transfer or disclosure.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Download size={14} /> EXPORT INCIDENT (PDF)
          </button>
          <button style={{ width: '100%', padding: '8px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <ShieldAlert size={14} /> ESCALATE (MFA)
          </button>
        </div>
      </div>
    </div>
  );
}
