import { Link, useLocation } from 'react-router-dom';
import { Home, Phone, Grid, User, Settings, FileText } from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  const path = location.pathname;

  const NavItem = ({ to, icon: Icon, isActive, label }) => (
    <Link 
      to={to} 
      className={`relative flex items-center h-12 lg:h-[42px] w-full lg:w-[calc(100%-24px)] mx-0 lg:mx-3 mb-1.5 transition-all duration-300 rounded-xl overflow-hidden ${isActive ? 'bg-[#5C3425] shadow-lg shadow-[#5C3425]/30' : 'bg-transparent hover:bg-[#5C3425]/5'}`}
      style={{ textDecoration: 'none' }}
    >
      <div className="flex items-center justify-center min-w-[60px] lg:min-w-[48px]">
        <Icon size={18} className={`${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#5C3425]/70'} transition-all duration-300 ${isActive && 'scale-110 drop-shadow-md'}`} />
      </div>
      <span className={`hidden lg:block whitespace-nowrap font-semibold text-xs tracking-wide transition-opacity duration-300 ${isActive ? 'text-white opacity-100' : 'text-gray-500 opacity-0 group-hover:opacity-100 lg:group-hover:opacity-100'}`}>
        {label}
      </span>
    </Link>
  );

  return (
    <div className="group fixed bottom-0 left-0 w-full h-[60px] lg:w-[72px] lg:hover:w-[240px] lg:h-full lg:top-0 bg-white/70 backdrop-blur-2xl border-t border-theme-dark/5 lg:border-t-0 lg:border-r shadow-[4px_0_24px_rgba(92,52,37,0.03)] flex flex-row lg:flex-col items-center lg:items-start justify-around lg:justify-start lg:py-6 z-50 transition-[width] duration-300 ease-out overflow-hidden">
      
      {/* Logo Section */}
      <Link to="/" className="hidden lg:flex items-center no-underline mb-8 min-w-[72px] w-full px-4" style={{ textDecoration: 'none' }}>
        <div className="flex items-center justify-center min-w-[40px]">
          <div className="w-11 h-11 rounded-full overflow-hidden shadow-lg shadow-[#5C3425]/20 group-hover:scale-105 transition-transform border-2 border-[#5C3425]">
            <img src="/custom-logo.jpg" alt="VoiceTrace Custom Logo" className="w-full h-full object-cover" />
          </div>
        </div>
        <span className="whitespace-nowrap font-black text-[13px] tracking-[0.2em] text-[#5C3425] opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300 ml-4 uppercase">
          VoiceTrace
        </span>
      </Link>
      
      {/* Navigation Links */}
      <NavItem to="/" icon={Home} isActive={path === '/'} label="Landing Page" />
      <NavItem to="/dashboard" icon={Phone} isActive={path === '/dashboard'} label="Live Bridge" />
      <NavItem to="/modules" icon={Grid} isActive={path === '/modules'} label="Modules" />
      <NavItem to="/profile" icon={User} isActive={path === '/profile'} label="Team Access" />
      <NavItem to="/settings" icon={Settings} isActive={path === '/settings'} label="Configuration" />
      <NavItem to="/reports" icon={FileText} isActive={path === '/reports'} label="Audit Logs" />
      
      <div className="hidden lg:block flex-1" />
    </div>
  );
}

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" x2="12" y1="19" y2="22"></line>
  </svg>
);
