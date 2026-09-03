import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Fatal React Crash:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base, #FDF9F5)' }}>
          <div style={{ maxWidth: '500px', width: '90%', background: 'var(--bg-card, #FFFFFF)', padding: '32px', borderRadius: '12px', border: '1px solid var(--accent-rust, #991B1B)', boxShadow: '0 10px 40px rgba(153, 27, 27, 0.15)', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: 'rgba(153, 27, 27, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <AlertCircle size={32} color="var(--accent-rust, #991B1B)" />
            </div>
            <h2 style={{ margin: '0 0 16px', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #4B2C20)' }}>System Failure</h2>
            <p style={{ margin: '0 0 24px', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary, #7A513E)' }}>
              The application encountered a fatal exception and was forced to halt. 
              <br/><br/>
              <code style={{ background: 'rgba(0,0,0,0.05)', padding: '4px 8px', borderRadius: 4, fontSize: 16 }}>{this.state.error?.toString()}</code>
            </p>
            <button 
              onClick={() => window.location.reload()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent-rust, #991B1B)', color: '#FFF', border: 'none', padding: '12px 24px', borderRadius: 100, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}
            >
              <RefreshCw size={16} /> Reboot Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
