import { MoreHorizontal } from 'lucide-react';
import { useState, useEffect } from 'react';
import { API_BASE } from '../lib/constants';

export default function IncidentLog({ events }) {
  const [historical, setHistorical] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/incidents`)
      .then(res => res.json())
      .then(data => setHistorical(data))
      .catch(console.error);
  }, []);

  const liveIncidents = events
    .filter(e => e.band === 'high' || e.band === 'medium')
    .map(e => ({
       incident_id: `LIVE-${e.call_id}`,
       timestamp: e.time,
       peak_risk_score: e.risk_score,
       band: e.band,
       recommendation: e.message
    }));

  // Combine and deduplicate by call_id if necessary, or just show both.
  const allIncidents = [...liveIncidents, ...historical.map(h => ({
    incident_id: h.incident_id,
    timestamp: new Date(h.timestamp).toLocaleTimeString(),
    peak_risk_score: h.peak_risk_score,
    band: h.band,
    recommendation: h.recommendation
  }))].slice(0, 10);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>Recent Incidents Log</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>
      <div style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allIncidents.length === 0 ? (
           <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>
             NO RECENT INCIDENTS
           </div>
        ) : (
           allIncidents.map((evt, idx) => (
             <div key={idx} style={{ background: 'var(--bg-base)', padding: '8px 12px', borderRadius: 4, borderLeft: `3px solid ${evt.band === 'high' ? 'var(--accent-rust)' : '#F59E0B'}` }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                 <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{evt.timestamp}</div>
                 <div style={{ fontSize: 11, fontWeight: 800, color: evt.band === 'high' ? 'var(--accent-rust)' : '#F59E0B' }}>Score: {evt.peak_risk_score}</div>
               </div>
               <div style={{ fontSize: 12, fontWeight: 600 }}>{evt.recommendation}</div>
             </div>
           ))
        )}
      </div>
    </div>
  );
}
