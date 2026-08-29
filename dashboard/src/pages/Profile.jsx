import Sidebar from '../components/Sidebar';
import { User, Shield, Mail, Key } from 'lucide-react';

export default function Profile() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
            <User size={32} color="var(--accent-peach)" />
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Operator Profile</h1>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ flex: '0 0 250px' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-surface)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={40} color="var(--accent-peach)" />
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>Admin Operator</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Security Operations Center</p>
                <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(28, 18, 13, 0.1)', padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700 }}>
                  <Shield size={12} color="var(--accent-rust)" /> Tier 1 Clearance
                </div>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
                <h3 style={{ margin: '0 0 24px', fontSize: 16, fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>Account Details</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <Mail size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>EMAIL ADDRESS</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>admin@voicetrace.local</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Key size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>MFA STATUS</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-green)' }}>Enabled (YubiKey)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
