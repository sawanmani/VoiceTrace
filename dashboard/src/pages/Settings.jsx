import Sidebar from '../components/Sidebar';
import { Settings as SettingsIcon, Sliders, BellRing, Database } from 'lucide-react';

export default function Settings() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
            <SettingsIcon size={32} color="var(--accent-peach)" />
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>System Settings</h1>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <Sliders size={20} color="var(--text-primary)" />
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Risk Thresholds</h3>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>High Risk Threshold</div>
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Triggers Incident Reports and MFA Escalation</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-rust)' }}>70 / 100</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>Medium Risk Threshold</div>
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Flags sessions for manual review</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-peach)' }}>40 / 100</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <Database size={20} color="var(--text-primary)" />
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Data Retention</h3>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>Audio Artifacts</div>
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>How long raw audio streams are stored</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>7 Days</div>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
