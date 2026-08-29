import { Link, useLocation } from 'react-router-dom';
import { Mic } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  
  return (
    <nav style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: '64px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      background: 'rgba(28, 18, 13, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      zIndex: 100,
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)'
    }}>
      <Link to="/" style={{ 
        display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none',
        transition: 'transform 0.2s ease',
      }}
      onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
      onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <div style={{ 
          width: 34, height: 34, 
          borderRadius: 10, 
          background: 'linear-gradient(135deg, var(--accent-peach), #C85A2C)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          boxShadow: '0 4px 16px rgba(217, 119, 70, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.2)' 
        }}>
          <Mic size={18} color="#ffffff" strokeWidth={2.5} />
        </div>
        <span style={{ 
          fontSize: 18, 
          fontWeight: 700, 
          color: '#ffffff',
          letterSpacing: '-0.02em'
        }}>VoiceTrace</span>
      </Link>

      <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
        {[
          { path: '/', label: 'Home' },
          { path: '/dashboard', label: 'Dashboard' }
        ].map((route) => {
          const isActive = location.pathname === route.path;
          return (
            <Link key={route.path} to={route.path} style={{
              position: 'relative',
              color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              transition: 'color 0.2s',
              padding: '6px 0'
            }}
            onMouseOver={(e) => { if(!isActive) e.currentTarget.style.color = 'rgba(255, 255, 255, 0.85)'; }}
            onMouseOut={(e) => { if(!isActive) e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)'; }}
            >
              {route.label}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: -2,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: 2,
                  background: 'var(--accent-peach)',
                  boxShadow: '0 0 10px var(--accent-peach)'
                }} />
              )}
            </Link>
          );
        })}

        <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.1)' }}></div>

        <a href="https://github.com/sawanmani/VoiceTrace" target="_blank" rel="noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 16px',
          borderRadius: '100px',
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.03)',
          color: 'rgba(255,255,255,0.9)',
          textDecoration: 'none',
          fontSize: '13px',
          fontWeight: 600,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
        }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path><path d="M9 18c-4.51 2-5-2-7-2"></path></svg>
          GitHub
        </a>
      </div>
    </nav>
  );
}
