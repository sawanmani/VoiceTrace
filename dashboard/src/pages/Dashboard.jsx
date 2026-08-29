import { useState, useEffect, useCallback } from 'react'
import { WS_BASE } from '../lib/constants'
import { useWebSocket } from '../hooks/useWebSocket'
import { useMicStream } from '../hooks/useMicStream'
import { useStore } from '../store/useStore'

import Sidebar from '../components/Sidebar'
import DashboardHeader from '../components/DashboardHeader'
import CallTimeline from '../components/CallTimeline'
import AdvancedRiskGauge from '../components/AdvancedRiskGauge'
import RadarAttribution from '../components/RadarAttribution'
import LanguageMonitor from '../components/LanguageMonitor'
import FeedbackPanel from '../components/FeedbackPanel'
import AlertCard from '../components/AlertCard'
import Waveform from '../components/Waveform'
import ScoreChart from '../components/ScoreChart'
import FileUpload from '../components/FileUpload'

export default function Dashboard() {
  const [now, setNow] = useState(new Date())

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Global state
  const state = useStore()
  const handleEvent = useStore(s => s.handleEvent)
  const finalizeCall = useStore(s => s.finalizeCall)
  const setAlertEvent = useStore(s => s.setAlertEvent)

  // Mic streaming
  const { active, startMic, stopMic } = useMicStream(
    handleEvent, 
    finalizeCall
  )

  const scoreWsUrl = active ? null : `${WS_BASE}/ws/score`
  const { connected, reconnecting } = useWebSocket(scoreWsUrl, handleEvent)

  const handleFileResults = useCallback((data) => {
    const windows = data.windows || []
    windows.forEach((w, i) => {
      setTimeout(() => handleEvent(w), i * 200)
    })
  }, [handleEvent])

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans">
      <Sidebar />
      <DashboardHeader 
        connected={connected} 
        active={active} 
        sessionCount={state.sessionCount} 
        onNewScan={() => document.getElementById('file-upload-input')?.click()} 
      />
      
      <main className="ml-[60px] pt-[72px] px-3 pb-3 h-auto lg:h-screen grid lg:grid-cols-[320px_1fr_300px] grid-cols-1 gap-3 box-border overflow-y-auto lg:overflow-hidden">
        
        {/* Left Column */}
        <div className="lg:h-full lg:overflow-hidden h-[400px] overflow-auto">
          <CallTimeline active={active} recentCalls={state.recentCalls} />
        </div>

        {/* Center Column */}
        <div className="flex flex-col gap-3 lg:h-full lg:overflow-hidden h-auto overflow-visible">
          <div style={{ flex: '0 0 auto', height: '300px' }}>
             <AdvancedRiskGauge score={state.riskScore} liveness={state.liveness} />
          </div>
          <div className="grid lg:grid-cols-2 grid-cols-1 gap-3 flex-1 min-h-0">
             <div style={{ height: '100%' }}>
               <RadarAttribution probabilities={state.signals?.probabilities} />
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column' }}>
                   <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, marginBottom: 8 }}>LIVE AUDIO STREAM [cite: Call ID: VT-H-2394]</div>
                   <div style={{ flex: 1, minHeight: 0 }}><Waveform active={active} score={state.riskScore} /></div>
                </div>
                <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column' }}>
                   <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, marginBottom: 8 }}>SCORE TIMELINE</div>
                   <div style={{ flex: 1, minHeight: 0 }}><ScoreChart history={state.history} /></div>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-3 lg:h-full lg:overflow-hidden h-auto overflow-visible">
           <div style={{ flex: 1 }}>
             {state.alertEvent ? (
               <AlertCard event={state.alertEvent} onDismiss={() => setAlertEvent(null)} /> 
             ) : (
               <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
                 NO ACTIVE INCIDENTS
               </div>
             )}
           </div>
           <div style={{ flex: 1.2 }}>
             <LanguageMonitor />
           </div>
           <div style={{ flex: 0.8 }}>
             <FeedbackPanel />
           </div>
        </div>

      </main>

      {/* Hidden file uploader triggered by DashboardHeader */}
      <div style={{ display: 'none' }}>
        <FileUpload onResults={handleFileResults} disabled={active} />
      </div>
    </div>
  )
}
