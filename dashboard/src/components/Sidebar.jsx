import { Link, useLocation } from 'react-router-dom';
import { Home, Phone, Grid, User, Settings, FileText, Clock, FileWarning } from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  const path = location.pathname;

  const NavItem = ({ to, icon: Icon, isActive }) => (
    <Link to={to} style={{ 
      width: '100%', 
      height: '40px', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: isActive ? 'var(--bg-surface)' : 'transparent',
      borderLeft: isActive ? '3px solid var(--accent-rust)' : '3px solid transparent',
      textDecoration: 'none'
    }}>
      <Icon size={20} color={isActive ? 'var(--accent-rust)' : 'var(--text-primary)'} style={{ cursor: 'pointer', opacity: isActive ? 1 : 0.8 }} />
    </Link>
  );

  return (
    <div style={{
      width: '60px',
      backgroundColor: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 0',
      gap: '16px',
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      zIndex: 50,
    }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', marginBottom: '10px' }}>V</div>
      </Link>
      
      <NavItem to="/" icon={Home} isActive={path === '/'} />
      <NavItem to="/dashboard" icon={Phone} isActive={path === '/dashboard'} />
      <NavItem to="/modules" icon={Grid} isActive={path === '/modules'} />
      <NavItem to="/profile" icon={User} isActive={path === '/profile'} />
      <NavItem to="/settings" icon={Settings} isActive={path === '/settings'} />
      <NavItem to="/reports" icon={FileText} isActive={path === '/reports'} />
      
      <div style={{ flex: 1 }} />
    </div>
  );
}
