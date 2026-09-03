import Sidebar from '../components/Sidebar';
import { User, Shield, Mail, Key } from 'lucide-react';

export default function Profile() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
            <User size={36} color="#5C3425" strokeWidth={2} />
            <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900, fontFamily: '"Playfair Display", serif', color: '#5C3425', letterSpacing: '0.02em' }}>Operator Profile</h1>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ flex: '0 0 250px' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, textAlign: 'center' }}>
                <div style={{ width: 100, height: 100, borderRadius: 24, background: 'var(--bg-surface)', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={48} color="#f97316" strokeWidth={1.5} opacity={0.5} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, fontFamily: '"Playfair Display", serif', color: '#5C3425' }}>Admin Operator</h3>
                <p style={{ margin: 0, fontSize: 18, color: 'var(--text-secondary)' }}>Security Operations Center</p>
                <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(28, 18, 13, 0.1)', padding: '4px 10px', borderRadius: 100, fontSize: 15, fontWeight: 700 }}>
                  <Shield size={12} color="var(--accent-rust)" /> Tier 1 Clearance
                </div>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
                <h3 style={{ margin: '0 0 32px', fontSize: 26, fontWeight: 900, fontFamily: '"Playfair Display", serif', color: '#5C3425', borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>Account Details</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <Mail size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-secondary)', fontFamily: '"Playfair Display", serif', letterSpacing: '0.05em' }}>EMAIL ADDRESS</div>
                    <div style={{ fontSize: 19, fontWeight: 500, color: '#5C3425', marginTop: 4 }}>admin@voicetrace.local</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Key size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-secondary)', fontFamily: '"Playfair Display", serif', letterSpacing: '0.05em' }}>MFA STATUS</div>
                    <div style={{ fontSize: 19, fontWeight: 500, color: '#5C3425', marginTop: 4 }}>Enabled (YubiKey)</div>
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
