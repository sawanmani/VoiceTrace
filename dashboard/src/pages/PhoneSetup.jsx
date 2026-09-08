import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import {
  PhoneCall, Globe, Server, Wifi, WifiOff,
  CheckCircle2, XCircle, ArrowRight, ExternalLink,
  Shield, Smartphone, Monitor, Radio
} from 'lucide-react';
import { API_BASE } from '../lib/constants';

// ── Only TRULY FREE providers ──────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'sip2sip',
    name: 'SIP2SIP.info',
    badge: '✅ 100% Free — Recommended',
    description: 'Free SIP account by AG Projects. Supports audio, video, chat. Register instantly — get a SIP address like yourname@sip2sip.info that anyone can call.',
    host: 'sip2sip.info',
    url: 'https://mdns.sipthor.net/register_sip_account.phtml',
    free: true,
  },
  {
    id: 'linphone',
    name: 'Linphone',
    badge: '✅ 100% Free — Open Source',
    description: 'Free SIP service by Belledonne Communications. Download the Linphone app on any phone, create free account, and make SIP calls.',
    host: 'sip.linphone.org',
    url: 'https://subscribe.linphone.org/',
    free: true,
  },
  {
    id: 'local',
    name: 'Local Softphone',
    badge: '✅ 100% Free — No Internet Needed',
    description: 'Use MicroSIP or any SIP softphone on your PC/phone. Connects directly to Asterisk on your local network. Works completely offline.',
    host: 'localhost',
    url: 'https://www.microsip.org/downloads',
    free: true,
  },
];

export default function PhoneSetup() {
  const [selectedProvider, setSelectedProvider] = useState('sip2sip');
  const [host, setHost] = useState('sip2sip.info');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState(null);

  // Poll SIP status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sip/status`);
        if (res.ok) setStatus(await res.json());
      } catch (_) {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleProviderSelect = (provider) => {
    setSelectedProvider(provider.id);
    if (provider.id !== 'local') {
      setHost(provider.host);
    }
    setMessage(null);
  };

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) {
      setMessage({ type: 'error', text: 'Username and password are required' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/sip/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_host: host, username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `✅ Saved! ${data.message || ''}` });
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to save' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Connection error: ${e.message}` });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/sip/test`, { method: 'POST' });
      const data = await res.json();
      if (data.connected) {
        setMessage({ type: 'success', text: `✅ Connected! ${data.detail}` });
      } else {
        setMessage({ type: 'error', text: `❌ ${data.detail || data.message}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Connection error: ${e.message}` });
    }
    setTesting(false);
  };

  const isConnected = status?.connected;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <PhoneCall size={32} color="var(--accent-green)" />
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800 }}>Free Phone Setup</h1>
            <span style={{
              background: 'rgba(16,185,129,0.15)', color: '#10b981',
              padding: '4px 12px', borderRadius: 100, fontSize: 14, fontWeight: 800,
              letterSpacing: '0.1em',
            }}>₹0 COST</span>
          </div>

          <p style={{ color: 'var(--text-secondary)', marginBottom: 32, fontSize: 18, lineHeight: 1.6 }}>
            Real-time phone calls through VoiceTrace — <strong>completely free</strong>. 
            No Twilio, no paid numbers, no credit card. Use free SIP providers or local softphones.
          </p>

          {/* Connection Status */}
          <div style={{
            background: isConnected ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isConnected ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
            borderRadius: 12, padding: '16px 20px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            {isConnected ? (
              <>
                <Wifi size={20} color="#10b981" />
                <div>
                  <div style={{ fontWeight: 700, color: '#10b981', fontSize: 17 }}>SIP Trunk Connected</div>
                  <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>
                    {status?.username}@{status?.provider_host}
                  </div>
                </div>
              </>
            ) : (
              <>
                <WifiOff size={20} color="var(--text-muted)" />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 17 }}>
                    {status?.configured ? 'Not Connected' : 'Not Configured'}
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>
                    {status?.error || 'Set up a free SIP provider below'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── 3 FREE MODES ──────────────────────────────────────────── */}
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} color="var(--accent-green)" />
            3 Free Ways to Connect
          </h2>

          {/* Mode Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              {
                icon: Monitor, title: 'Local Softphone',
                desc: 'MicroSIP on your PC calls Asterisk directly. Works offline, zero setup.',
                steps: ['Download MicroSIP', 'Register as demo/voicetrace123', 'Dial any number', 'See detection on Dashboard'],
                color: '#8b5cf6',
              },
              {
                icon: Smartphone, title: 'Free SIP App',
                desc: 'Install Linphone app on any phone. Create free account. Call your Asterisk SIP address.',
                steps: ['Install Linphone on phone', 'Create free account', 'Call yourname@sip2sip.info', 'VoiceTrace detects live'],
                color: '#3b82f6',
              },
              {
                icon: Radio, title: 'WebRTC Browser',
                desc: 'Already built! Go to Live Call page. Browser-to-browser with detection overlay.',
                steps: ['Go to /call page', 'Create Room', 'Share link with other person', 'Both see live detection'],
                color: '#10b981',
              },
            ].map((mode, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <mode.icon size={20} color={mode.color} />
                  <span style={{ fontWeight: 800, fontSize: 17 }}>{mode.title}</span>
                </div>
                <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {mode.desc}
                </p>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                  {mode.steps.map((s, j) => <li key={j}>{s}</li>)}
                </ol>
                <div style={{
                  marginTop: 'auto', padding: '4px 10px', borderRadius: 6,
                  background: `${mode.color}15`, color: mode.color,
                  fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textAlign: 'center',
                }}>
                  100% FREE
                </div>
              </div>
            ))}
          </div>

          {/* ── SIP Provider Config (for Mode 2) ─────────────────────── */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Globe size={18} color="var(--text-muted)" />
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Free SIP Provider Setup</h3>
            </div>

            {/* Provider selection */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProviderSelect(p)}
                  style={{
                    flex: 1, padding: '14px 16px', borderRadius: 10,
                    background: selectedProvider === p.id ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `2px solid ${selectedProvider === p.id ? '#10b981' : 'var(--border)'}`,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: '#10b981', fontWeight: 700, marginBottom: 6 }}>{p.badge}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.description}</div>
                  <a
                    href={p.url} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 14, color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}
                  >
                    Sign Up Free <ExternalLink size={12} />
                  </a>
                </button>
              ))}
            </div>

            {/* Credentials Form */}
            {selectedProvider !== 'local' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                      SIP Host
                    </label>
                    <input
                      value={host} onChange={e => setHost(e.target.value)}
                      style={{
                        width: '100%', height: 42, borderRadius: 8,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontSize: 16, padding: '0 12px',
                        outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                      Username
                    </label>
                    <input
                      value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="your_sip_username"
                      style={{
                        width: '100%', height: 42, borderRadius: 8,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontSize: 16, padding: '0 12px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        width: '100%', height: 42, borderRadius: 8,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontSize: 16, padding: '0 12px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      flex: 1, height: 44, borderRadius: 10,
                      background: saving ? 'rgba(16,185,129,0.3)' : 'linear-gradient(135deg, #059669, #10b981)',
                      border: 'none', cursor: saving ? 'wait' : 'pointer',
                      color: '#fff', fontSize: 16, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {saving ? 'Saving...' : 'Save & Connect'}
                  </button>
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    style={{
                      flex: 1, height: 44, borderRadius: 10,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)',
                      cursor: testing ? 'wait' : 'pointer',
                      color: 'var(--text-primary)', fontSize: 16, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <Wifi size={16} />
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </>
            )}

            {/* Local softphone instructions */}
            {selectedProvider === 'local' && (
              <div style={{
                background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 10, padding: 20,
              }}>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12, color: '#a78bfa' }}>
                  Local Softphone Setup (No Config Needed!)
                </div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 16, color: 'var(--text-secondary)', lineHeight: 2 }}>
                  <li>Download <a href="https://www.microsip.org/downloads" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>MicroSIP</a> (Windows) or <a href="https://www.linphone.org/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>Linphone</a> (any platform)</li>
                  <li>Start Asterisk Docker: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: 4, fontSize: 14 }}>docker-compose up -d asterisk</code></li>
                  <li>In softphone, register with:
                    <div style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, marginTop: 6, fontSize: 15 }}>
                      Server: <strong>localhost:5060</strong> &nbsp;|&nbsp; User: <strong>demo</strong> &nbsp;|&nbsp; Pass: <strong>voicetrace123</strong>
                    </div>
                    <div style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, marginTop: 6, fontSize: 15 }}>
                      Server: <strong>localhost:5060</strong> &nbsp;|&nbsp; User: <strong>demo2</strong> &nbsp;|&nbsp; Pass: <strong>voicetrace456</strong>
                    </div>
                  </li>
                  <li>Dial any number → audio streams to VoiceTrace → risk scores on Dashboard!</li>
                </ol>
              </div>
            )}

            {/* Status message */}
            {message && (
              <div style={{
                marginTop: 16, padding: '12px 16px', borderRadius: 8,
                background: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: message.type === 'success' ? '#10b981' : '#ef4444',
                fontSize: 15, fontWeight: 600,
              }}>
                {message.text}
              </div>
            )}
          </div>

          {/* Architecture Flow */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Server size={18} color="var(--text-muted)" />
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>How It Works</h3>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, flexWrap: 'wrap', padding: '16px 0',
            }}>
              {[
                { label: '📱 Your Phone', sub: 'Linphone App' },
                { label: '🌐 Free SIP', sub: 'sip2sip.info' },
                { label: '📞 Asterisk', sub: 'Docker (free)' },
                { label: '🤖 AASIST-L', sub: 'AI Detection' },
                { label: '📊 Dashboard', sub: 'Risk Scores' },
              ].map((node, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '10px 16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 22 }}>{node.label.split(' ')[0]}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{node.label.split(' ').slice(1).join(' ')}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{node.sub}</div>
                  </div>
                  {i < arr.length - 1 && <ArrowRight size={16} color="var(--text-muted)" />}
                </div>
              ))}
            </div>
            <div style={{
              textAlign: 'center', marginTop: 12, padding: '8px 16px',
              background: 'rgba(16,185,129,0.08)', borderRadius: 8,
              color: '#10b981', fontSize: 15, fontWeight: 700,
            }}>
              Total Cost: ₹0 — Everything in this pipeline is free and open-source
            </div>
          </div>

          {/* Footer note */}
          <p style={{ fontSize: 15, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            All audio is processed in real-time. Raw audio is never stored on the server (DPDP Act compliant).
            <br />VoiceTrace · SIH 2026 · PSID 260104
          </p>

        </div>
      </main>
    </div>
  );
}
