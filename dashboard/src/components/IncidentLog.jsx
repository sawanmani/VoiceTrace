import { MoreHorizontal } from 'lucide-react';

export default function IncidentLog({ events }) {
  const incidents = events.filter(e => e.band === 'high' || e.band === 'medium').slice(0, 10);
  
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>Recent Incidents Log</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>
      <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {incidents.length === 0 ? (
           <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
             NO RECENT INCIDENTS
           </div>
        ) : (
           incidents.map((evt, idx) => (
             <div key={idx} style={{ background: 'var(--bg-base)', padding: '8px 12px', borderRadius: 4, borderLeft: `3px solid ${evt.band === 'high' ? 'var(--accent-rust)' : '#F59E0B'}` }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                 <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{evt.time}</div>
                 <div style={{ fontSize: 11, fontWeight: 800, color: evt.band === 'high' ? 'var(--accent-rust)' : '#F59E0B' }}>Score: {evt.risk_score}</div>
               </div>
               <div style={{ fontSize: 12, fontWeight: 600 }}>{evt.message}</div>
             </div>
           ))
        )}
      </div>
    </div>
  );
}
