import { MoreHorizontal, Mic, UserCheck, ShieldCheck, AlertCircle } from 'lucide-react';

export default function AdvancedRiskGauge({ score, liveness, callerIdentity }) {
  const rGauge = 70;
  const circGauge = Math.PI * rGauge; // half circle
  const offsetGauge = circGauge * (1 - (score / 100));

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>VOICE AUTHENTICITY RISK // COMPOSITE SCORE (0-100)</h3>
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>

      <div className="flex flex-col lg:flex-row flex-1 items-center p-4 gap-6 lg:gap-0">
        
        {/* Left: Concentric Arcs */}
        <div className="flex-1 flex justify-center w-full">
          <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(180deg)' }}>
            {[40, 32, 24, 16].map((r, i) => (
              <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={i === 0 ? 'var(--accent-rust)' : 'var(--border)'} strokeWidth="4" strokeDasharray={Math.PI * r} strokeDashoffset={i % 2 === 0 ? 0 : 20} strokeLinecap="round" />
            ))}
          </svg>
          <div style={{ position: 'absolute', background: 'var(--bg-base)', padding: 8, borderRadius: '50%', border: '2px solid var(--accent-rust)' }}>
            <Mic size={24} color="var(--accent-rust)" />
          </div>
        </div>

        {/* Center: Speedometer Gauge */}
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <div className="relative w-full max-w-[200px] flex flex-col items-center">
            <svg viewBox="0 0 180 100" style={{ width: '100%' }}>
              {/* Background Track */}
              <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke="var(--border)" strokeWidth="12" strokeLinecap="round" />
              {/* Active Fill */}
              <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke="var(--accent-rust)" strokeWidth="12" strokeLinecap="round" strokeDasharray={circGauge} strokeDashoffset={offsetGauge} />
              {/* Ticks */}
              {[0, 20, 40, 60, 80, 100].map(val => {
                const angle = 180 + (val / 100) * 180;
                const rad = angle * (Math.PI / 180);
                const x1 = 90 + Math.cos(rad) * 60;
                const y1 = 90 + Math.sin(rad) * 60;
                const x2 = 90 + Math.cos(rad) * 70;
                const y2 = 90 + Math.sin(rad) * 70;
                return (
                  <g key={val}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-secondary)" strokeWidth="2" />
                    <text x={90 + Math.cos(rad) * 45} y={90 + Math.sin(rad) * 45} fontSize="10" fill="var(--text-secondary)" textAnchor="middle" dominantBaseline="middle">{val}</text>
                  </g>
                )
              })}
            </svg>
            <div className="absolute bottom-2 left-0 right-0 text-center">
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{score}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 4, fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
              <span>Low</span>
              <span style={{ color: 'var(--accent-rust)' }}>High Risk</span>
            </div>
          </div>

          <div style={{ marginTop: 12, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: 8, width: '100%', textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>New Liveness & Voiceprint Layer</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
              PASSIVE Liveness Score: {liveness ? Math.round(liveness * 100) : '--'}%{' '}
              <span className={`px-1.5 py-0.5 rounded font-semibold ml-1 ${liveness > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {liveness > 0.8 ? 'SECURE' : 'WARNING'}
              </span><br/>
              <span style={{ color: liveness && liveness < 0.8 ? 'var(--accent-rust)' : 'var(--text-secondary)' }} className="inline-flex items-center mt-1">
                <AlertCircle size={10} style={{ marginRight: 4 }}/> Active Challenge Status: <span className="font-bold ml-1">{liveness && liveness < 0.8 ? 'REQUIRED' : 'STANDBY'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Verification layers */}
        <div className="flex-[1.5] flex flex-col gap-3 w-full lg:pl-4 lg:border-l border-[var(--border)]">
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>CALLER IDENTITY VERIFICATION</div>
            <div className="mb-3"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">OPT-IN ENABLED</span></div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ background: '#E5E7EB', padding: 6, borderRadius: '50%' }}><UserCircle color="#4B5563" size={16} /></div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Voiceprint Match:</div>
                <div style={{ fontSize: 10 }}>
                  {callerIdentity === null ? (
                    <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-bold">NOT ENROLLED / NEW CALLER</span>
                  ) : (
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">{Math.round(callerIdentity * 100)}% MATCH</span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <ShieldCheck color="#10B981" size={14} />
              <div style={{ fontSize: 11 }}>Accurate Liveness: <span style={{ color: '#10B981', fontWeight: 600 }}>{liveness ? Math.round(liveness * 100) : '--'}%</span></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Quick dummy icons for UserCircle / Fingerprint to avoid more imports
const UserCircle = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/></svg>;
const Fingerprint = ({ size, color }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10"/><path d="M5 12a7 7 0 0 1 14 0"/><path d="M8 12a4 4 0 0 1 8 0"/><path d="M11 12a1 1 0 0 1 2 0"/></svg>;
