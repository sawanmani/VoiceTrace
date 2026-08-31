import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { PhoneCall, Copy, CheckCircle2, Globe, Server } from 'lucide-react';
import { API_BASE } from '../lib/constants';

export default function TwilioConfig() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate the webhook URL dynamically based on current host
    try {
        const url = new URL(API_BASE);
        const fullUrl = `${url.protocol}//${url.host}/twilio/incoming`;
        setWebhookUrl(fullUrl);
    } catch (e) {
        // Fallback for localhost
        setWebhookUrl(`http://localhost:8000/twilio/incoming`);
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar />
      <main style={{ marginLeft: '60px', paddingTop: '60px', padding: '40px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <PhoneCall size={32} color="var(--accent-green)" />
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Twilio Integration</h1>
          </div>

          <p style={{ color: 'var(--text-secondary)', marginBottom: 40, fontSize: 14 }}>
            Connect live phone calls to VoiceTrace using Twilio Media Streams. When a user dials your Twilio number, the audio is bridged to the VoiceTrace ML engine in real-time.
          </p>

          {/* Webhook Configuration Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Globe size={18} color="var(--text-muted)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Webhook URL</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              Copy this URL and paste it into your Twilio Phone Number configuration under <strong>"A CALL COMES IN"</strong> (set to HTTP POST).
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'monospace', color: 'var(--accent-blue)', userSelect: 'all' }}>
                {webhookUrl || 'Loading...'}
              </div>
              <button 
                onClick={handleCopy}
                style={{ background: copied ? 'var(--accent-green)' : 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', width: 44, height: 44 }}
                title="Copy Webhook URL"
              >
                {copied ? <CheckCircle2 size={18} color="#fff" /> : <Copy size={18} color="var(--text-primary)" />}
              </button>
            </div>
          </div>

          {/* Setup Instructions */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Server size={18} color="var(--text-muted)" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Setup Instructions</h3>
            </div>
            
            <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <li>Log in to your <a href="https://console.twilio.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>Twilio Console</a>.</li>
              <li>Navigate to <strong>Phone Numbers</strong> &gt; <strong>Manage</strong> &gt; <strong>Active numbers</strong>.</li>
              <li>Click on the phone number you want to use with VoiceTrace.</li>
              <li>Scroll down to the <strong>Voice & Fax</strong> section.</li>
              <li>Under <strong>"A CALL COMES IN"</strong>, select <strong>Webhook</strong>.</li>
              <li>Paste the Webhook URL copied above and ensure the method is set to <strong>HTTP POST</strong>.</li>
              <li>Save your changes and dial the Twilio number. The call will appear live on the VoiceTrace Dashboard!</li>
            </ol>
          </div>

        </div>
      </main>
    </div>
  );
}
