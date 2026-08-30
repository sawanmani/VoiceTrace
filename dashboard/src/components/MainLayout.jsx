import React, { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { WS_BASE } from '../lib/constants';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMicStream } from '../hooks/useMicStream';
import { useStore } from '../store/useStore';

import Sidebar from './Sidebar';
import DashboardHeader from './DashboardHeader';
import FileUpload from './FileUpload';

export default function MainLayout() {
  const [now, setNow] = useState(new Date());

  // Global Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Global state
  const state = useStore();
  const handleEvent = useStore((s) => s.handleEvent);
  const finalizeCall = useStore((s) => s.finalizeCall);

  // Persistent Mic streaming globally
  const { active, startMic, stopMic } = useMicStream(handleEvent, finalizeCall);

  // Persistent WebSocket connection globally
  const scoreWsUrl = active ? null : `${WS_BASE}/ws/score`;
  const { connected, reconnecting } = useWebSocket(scoreWsUrl, handleEvent);

  // Global File Upload Handling
  const handleFileResults = useCallback((data) => {
    const windows = data.windows || [];
    windows.forEach((w, i) => {
      setTimeout(() => handleEvent(w), i * 200);
    });
  }, [handleEvent]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
      <Sidebar />
      <DashboardHeader 
        connected={connected} 
        active={active} 
        sessionCount={state.sessionCount} 
        onNewScan={() => document.getElementById('file-upload-input')?.click()} 
      />
      
      {/* 
        The <main> tag acts as the shell for the entire app.
        The layout accounts for the 72px Sidebar on Desktop (lg:ml-[72px])
        and the 72px DashboardHeader (pt-[72px]).
      */}
      <main className="lg:ml-[72px] mb-[60px] lg:mb-0 pt-[72px] h-auto min-h-screen box-border flex flex-col">
        {/* Render the current route (Home, Dashboard, etc.) passing persistent state via context */}
        <Outlet context={{ active, connected, startMic, stopMic }} />
      </main>

      {/* Hidden file uploader triggered globally by DashboardHeader */}
      <div style={{ display: 'none' }}>
        <FileUpload onResults={handleFileResults} disabled={active} />
      </div>
    </div>
  );
}
