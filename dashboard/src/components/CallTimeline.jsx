import { ShieldAlert, MoreHorizontal, ChevronDown, Filter } from 'lucide-react';

export default function CallTimeline({ active, recentCalls = [] }) {
  // Format duration to mm:ss for display
  const formatSec = (s) => {
    if (!s) return '00:00:00';
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `00:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)', borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 2, fontSize: 15, fontWeight: 600 }}>
          RECENT CALL HISTORY <ChevronDown size={14} />
        </div>
        <Filter size={14} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} />
      </div>

      <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>ACTIVE & RECENT CALLS</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 16px 24px', position: 'relative' }}>
        {/* Vertical Timeline Line */}
        {(active || recentCalls.length > 0) && <div style={{ position: 'absolute', left: 28, top: 24, bottom: 24, width: 2, background: 'var(--border)' }} />}

        {(!active && recentCalls.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[var(--text-secondary)] opacity-70 mt-10">
             <div className="w-12 h-12 rounded-full border-2 border-dashed border-[var(--border-glow)] flex items-center justify-center mb-3">
               <ShieldAlert size={20} />
             </div>
             <div className="text-[11px] font-bold tracking-wider uppercase">Waiting for calls...</div>
             <div className="text-[10px] mt-1">No active streams found in this session.</div>
          </div>
        )}

        {active && (
          <div style={{ position: 'relative', paddingLeft: 24, marginBottom: 16 }}>
            <div style={{ position: 'absolute', left: -7, top: 4, width: 12, height: 12, borderRadius: '50%', background: 'var(--accent-green)', border: '2px solid var(--bg-card)', zIndex: 2, animation: 'pulse 1.5s infinite' }} />
            <div style={{ background: 'var(--bg-surface)', border: `1px solid var(--border-glow)`, borderRadius: 4, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Call ID: [LIVE STREAM]</div>
                <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 2 }}>Time: In Progress</div>
                <div style={{ fontSize: 15, color: 'var(--accent-green)', fontWeight: 600 }}>Active Recording</div>
              </div>
            </div>
          </div>
        )}

        {recentCalls.map((call, idx) => {
          const isHigh = call.band === 'high';
          return (
            <div key={idx} style={{ position: 'relative', paddingLeft: 24, marginBottom: 16 }}>
              {/* Timeline Dot */}
              <div style={{ position: 'absolute', left: -7, top: 4, width: 12, height: 12, borderRadius: '50%', background: 'var(--text-muted)', border: '2px solid var(--bg-card)', zIndex: 2 }} />
              
              <div style={{ background: 'var(--bg-card)', border: `1px solid ${isHigh ? 'var(--border-glow)' : 'var(--border)'}`, borderRadius: 4, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Call ID: {call.call_id}</div>
                  <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 2 }}>Time: {call.time}</div>
                  <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 2 }}>Duration: {formatSec(call.duration_sec)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Peak Risk: {Math.round(call.peak_risk)}</div>
                </div>
                
                {isHigh ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <ShieldAlert size={24} color="var(--accent-rust)" />
                    <div style={{ background: 'var(--accent-rust)', color: '#fff', fontSize: 14, fontWeight: 700, padding: '2px 6px', borderRadius: 2 }}>HIGH RISK</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <ShieldAlert size={24} color="var(--accent-peach)" />
                    <div style={{ background: 'var(--accent-peach)', color: 'var(--bg-card)', fontSize: 14, fontWeight: 700, padding: '2px 6px', borderRadius: 2 }}>LOW RISK</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
