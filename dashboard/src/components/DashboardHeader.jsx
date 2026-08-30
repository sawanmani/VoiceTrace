import { Play, Activity, Settings2, ShieldCheck, ChevronDown, Bell, Radio, PhoneCall, HelpCircle, UserCircle } from 'lucide-react';

export default function DashboardHeader({ connected, active, sessionCount, onNewScan }) {
  return (
    <div className="fixed top-0 left-0 lg:left-[72px] right-0 z-40 h-[72px] flex items-center justify-between px-6 lg:px-8 bg-white/70 backdrop-blur-2xl border-b border-theme-dark/5 shadow-[0_4px_30px_rgba(92,52,37,0.03)] transition-all">
      
      {/* Left Area - Breadcrumb / Page Context */}
      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-2.5 bg-white/80 px-4 py-2 rounded-2xl border border-theme-dark/10 shadow-sm">
          <div className="w-2 h-2 rounded-full bg-theme-dark shadow-[0_0_8px_rgba(92,52,37,0.6)] animate-pulse" />
          <span className="text-xs font-semibold text-theme-dark">Live Telemetry</span>
          <span className="text-gray-300 font-light mx-1">/</span>
          <span className="text-xs font-medium text-gray-500">SIH 2026 Engine</span>
        </div>
      </div>

      {/* Right Area - Controls & Status */}
      <div className="flex items-center gap-6">
        
        {/* Sleek Status Indicators */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/80 rounded-full border border-gray-100 shadow-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
            <span className="text-[11px] font-medium text-gray-600">{connected ? 'WS Connected' : 'WS Down'}</span>
          </div>
          
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/80 rounded-full border border-gray-100 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-theme-dark shadow-[0_0_8px_rgba(92,52,37,0.5)]" />
            <span className="text-[11px] font-medium text-gray-600">Optimized</span>
          </div>
          
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/80 rounded-full border border-gray-100 shadow-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-theme-dark shadow-[0_0_8px_rgba(92,52,37,0.8)] animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-[11px] font-medium text-gray-600">Calls: {active ? 1 : 0}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 border-l border-[#5C3425]/10 pl-6">
          <button className="hidden sm:flex items-center gap-2 px-5 py-2 bg-white hover:bg-[#F3EAE1] text-[#5C3425] border border-[#5C3425]/10 transition-all rounded-full shadow-sm hover:shadow-md group">
            <Radio size={14} className="text-[#5C3425]/50 group-hover:text-[#5C3425] transition-colors" /> 
            <span className="text-xs font-semibold uppercase tracking-wider">Monitor</span>
          </button>
          
          <button className="hidden sm:flex items-center gap-2 px-5 py-2 bg-white hover:bg-[#F3EAE1] text-[#5C3425] border border-[#5C3425]/10 transition-all rounded-full shadow-sm hover:shadow-md group">
            <PhoneCall size={14} className="text-[#5C3425]/50 group-hover:text-[#5C3425] transition-colors" /> 
            <span className="text-xs font-semibold uppercase tracking-wider">Bridge</span>
          </button>

          <button onClick={onNewScan} className="relative group flex items-center gap-2 px-7 py-2.5 bg-[#5C3425] hover:bg-[#4A291D] text-white transition-all rounded-full shadow-lg shadow-[#5C3425]/30 hover:-translate-y-0.5 overflow-hidden">
            <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-out" />
            <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">New Scan</span>
          </button>
        </div>
        
        {/* Utilities */}
        <div className="flex items-center gap-2 ml-2">
          <button className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-theme-dark hover:bg-theme-dark/5 rounded-xl transition-all border border-transparent">
            <Bell size={16} />
          </button>
          <button className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-theme-dark hover:bg-theme-dark/5 rounded-xl transition-all border border-transparent">
            <HelpCircle size={16} />
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-theme-dark/5 text-theme-dark hover:bg-theme-dark/10 ml-2 transition-colors">
            <UserCircle size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
