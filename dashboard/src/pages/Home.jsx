import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, ShieldCheck, Globe, Activity, Lock, Zap } from 'lucide-react';
import AdvancedRiskGauge from '../components/AdvancedRiskGauge';
import RadarAttribution from '../components/RadarAttribution';

export default function Home() {
  const [liveness, setLiveness] = useState(98.5);
  const [probs, setProbs] = useState({ genuine: 0.98, spoof: 0.02, synthetic: 0.01, cloned: 0.01 });

  // Simulate live incoming stream data for the preview
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveness(prev => {
        const next = prev + (Math.random() * 3 - 1.5);
        return Math.min(99.9, Math.max(88.0, next));
      });
      
      const spoofVar = Math.random() * 0.06;
      setProbs({
        genuine: 0.96 - spoofVar,
        spoof: spoofVar,
        synthetic: spoofVar * 0.4,
        cloned: spoofVar * 0.6
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      {/* Ambient glowing background */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: -1, background: 'radial-gradient(circle at top center, rgba(244, 227, 211, 0.6) 0%, var(--bg-base) 70%)' }}>
      </div>

      <main style={{ flex: 1, paddingTop: '160px', paddingBottom: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingLeft: 24, paddingRight: 24 }}>
        
        <div style={{
          animation: 'fadeIn 0.5s ease both',
          marginBottom: 24,
          width: 80, height: 80,
          background: '#FFFFFF',
          border: '1px solid var(--border)',
          borderRadius: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(162, 107, 73, 0.08)'
        }}>
          <Mic size={32} color="var(--text-primary)" strokeWidth={1.5} />
        </div>

        <div style={{ animation: 'fadeIn 0.5s ease both', animationDelay: '50ms', marginBottom: 20, fontSize: '12px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent-peach)' }}>
          The open-source AI voice shield
        </div>

        <h1 style={{ 
          animation: 'fadeIn 0.5s ease both', animationDelay: '100ms',
          fontSize: 'clamp(3rem, 7vw, 5.5rem)', 
          fontWeight: 800, 
          lineHeight: 1,
          letterSpacing: '-0.03em', 
          margin: '0 0 20px 0',
          maxWidth: 800,
          color: 'var(--text-primary)'
        }}>
          Detect, analyze and protect.
        </h1>

        <p style={{ 
          animation: 'fadeIn 0.5s ease both', animationDelay: '200ms',
          color: 'var(--text-secondary)', 
          fontSize: 'clamp(1rem, 1.5vw, 1.15rem)', 
          maxWidth: 600, 
          margin: '0 auto',
          lineHeight: 1.6,
          fontWeight: 500
        }}>
          Detect deepfakes, analyze audio artifacts with AASIST-L, and protect your communications. A powerful local alternative running <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>entirely on your machine.</strong>
        </p>

        <div style={{ display: 'flex', gap: '16px', marginTop: '40px', animation: 'fadeIn 0.5s ease both', animationDelay: '300ms', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/dashboard" className="primary-btn" style={{
            padding: '12px 28px',
            borderRadius: '100px',
            background: 'var(--accent-peach)',
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: '13px',
            textDecoration: 'none',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            boxShadow: '0 8px 24px rgba(162, 107, 73, 0.25)',
            transition: 'all 0.2s',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>Launch Dashboard</Link>

          <a href="https://github.com/sawanmani/VoiceTrace" target="_blank" rel="noreferrer" style={{
            padding: '12px 24px',
            borderRadius: '100px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: '13px',
            textDecoration: 'none',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
            View on GitHub
          </a>
        </div>

        {/* Live Mockup Preview Area */}
        <div style={{ 
          marginTop: '80px', 
          width: '100%', 
          maxWidth: '1000px', 
          height: '420px', 
          borderRadius: '24px', 
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 25px 60px rgba(162, 107, 73, 0.15), 0 8px 20px rgba(162, 107, 73, 0.05)',
          animation: 'fadeIn 0.5s ease both', animationDelay: '400ms',
          display: 'flex', flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Mac OS Window Controls */}
          <div style={{ background: 'var(--bg-surface)', height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }}></div>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }}></div>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }}></div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px' }}>OFFLINE DEMO ANIMATION</div>
          </div>
          
          {/* Dashboard Components Preview */}
          <div style={{ flex: 1, display: 'flex', background: 'var(--bg-base)', padding: '24px', gap: '24px' }}>
            <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AdvancedRiskGauge score={14} liveness={liveness} />
            </div>
            <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RadarAttribution probabilities={probs} />
            </div>
          </div>
        </div>

        {/* Feature Grid Section */}
        <div style={{ 
          marginTop: '120px', 
          width: '100%', 
          maxWidth: '1100px', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '32px',
          textAlign: 'left'
        }}>
          
          <div style={{ background: 'transparent', padding: '24px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(162, 107, 73, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Activity size={24} color="var(--accent-peach)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Continuous Detection</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>Real-time deepfake analysis running locally on your device. Never upload sensitive audio to the cloud again.</p>
          </div>

          <div style={{ background: 'transparent', padding: '24px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(162, 107, 73, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <ShieldCheck size={24} color="var(--accent-peach)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>AASIST-L Powered</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>Utilizes state-of-the-art Anti-Spoofing models to detect synthetic artifacts and voice cloning in milliseconds.</p>
          </div>

          <div style={{ background: 'transparent', padding: '24px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(162, 107, 73, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Globe size={24} color="var(--accent-peach)" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Multilingual Support</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>Designed to work across languages and dialects, adapting to distinct acoustic characteristics globally.</p>
          </div>

        </div>

      </main>
    </div>
  )
}
