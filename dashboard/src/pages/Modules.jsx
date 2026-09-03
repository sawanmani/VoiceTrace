import Sidebar from '../components/Sidebar';
import { Grid, CheckCircle2, SlidersHorizontal, Activity } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function Modules() {
  const state = useStore();
  const isActive = state.sessionCount > 0;

  const modules = [
    { name: 'Core Liveness Detection', status: isActive ? 'active' : 'standby', desc: 'Detects playback, TTS, and AI synthesized voices.', accuracy: '99.8%' },
    { name: 'Caller Identity (F3)', status: isActive ? 'active' : 'standby', desc: 'Voiceprint matching for enrolled users.', accuracy: '98.5%' },
    { name: 'Codec Degradation Signature', status: isActive ? 'active' : 'standby', desc: 'Analyzes compression artifacts and packet loss.', accuracy: '97.2%' },
    { name: 'Multilingual Adaptation', status: 'standby', desc: 'Regional accent and dialect classification.', accuracy: 'N/A' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <Grid size={32} color="var(--accent-peach)" />
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Module Configuration</h1>
          </div>

          <p style={{ color: 'var(--text-secondary)', marginBottom: 40, fontSize: 18 }}>
            Manage the active detection engines and layers for your VoiceTrace deployment.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {modules.map(mod => (
              <div key={mod.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{mod.name}</h3>
                  {mod.status === 'active' ? (
                    <CheckCircle2 size={20} color="var(--accent-green)" />
                  ) : (
                    <Activity size={20} color="var(--text-muted)" />
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 17, lineHeight: 1.5, flex: 1 }}>{mod.desc}</p>
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-muted)' }}>ACCURACY: {mod.accuracy}</span>
                  <button style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', fontSize: 16, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SlidersHorizontal size={14} /> Configure
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
