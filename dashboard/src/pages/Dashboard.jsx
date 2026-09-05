import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { API_BASE } from '../lib/constants'

import CallTimeline from '../components/CallTimeline'
import AdvancedRiskGauge from '../components/AdvancedRiskGauge'
import RadarAttribution from '../components/RadarAttribution'
import IncidentLog from '../components/IncidentLog'
import FeedbackPanel from '../components/FeedbackPanel'
import AlertCard from '../components/AlertCard'
import Waveform from '../components/Waveform'
import ScoreChart from '../components/ScoreChart'

export default function Dashboard() {
  const [now, setNow] = useState(new Date())

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Hydrate call history from SQLite on mount so history survives page refresh
  const setRecentCalls = useStore(s => s.setRecentCalls)
  useEffect(() => {
    fetch(`${API_BASE}/history`, {
      headers: { 'X-Api-Key': import.meta.env.VITE_API_KEY || '' }
    })
      .then(r => r.ok ? r.json() : [])
      .then(calls => { if (Array.isArray(calls) && calls.length) setRecentCalls(calls) })
      .catch(() => {}) // silent fallback — in-memory state still works
  }, [setRecentCalls])

  // Global state
  const state = useStore()
  const setAlertEvent = useStore(s => s.setAlertEvent)

  // Grab persistent global connection state from MainLayout
  const { active, connected } = useOutletContext()

  return (
    <div className="p-4 md:p-6 lg:p-6 h-auto lg:h-[calc(100vh-72px)] grid lg:grid-cols-[320px_1fr_300px] grid-cols-1 gap-4 lg:gap-6 box-border overflow-y-auto lg:overflow-hidden w-full">
        
        {/* Left Column */}
        <div className="lg:h-full lg:overflow-hidden min-h-[300px] h-auto overflow-auto">
          <CallTimeline active={active} recentCalls={state.recentCalls} />
        </div>

        {/* Center Column */}
        <div className="flex flex-col gap-4 lg:gap-6 lg:h-full lg:overflow-hidden h-auto overflow-visible">
          <div className="flex-none min-h-[250px] lg:min-h-[300px]">
             <AdvancedRiskGauge score={state.riskScore} liveness={state.liveness} callerIdentity={state.callerIdentity} challengeActive={state.challengeActive} />
          </div>
          <div className="grid lg:grid-cols-2 grid-cols-1 gap-4 lg:gap-6 flex-1 min-h-0">
             <div style={{ height: '100%' }}>
               <RadarAttribution signals={state.signals} />
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column' }}>
                   <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                     LIVE AUDIO STREAM 
                     <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold">{state.activeCallId || 'NO ACTIVE CALL'}</span>
                   </div>
                   <div style={{ flex: 1, minHeight: 0 }}><Waveform active={active} score={state.riskScore} /></div>
                </div>
                <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column' }}>
                   <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5, marginBottom: 8 }}>SCORE TIMELINE</div>
                   <div style={{ flex: 1, minHeight: 0 }}><ScoreChart history={state.history} /></div>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-4 lg:gap-6 lg:h-full lg:overflow-hidden h-auto overflow-visible">
           <div style={{ flex: 1 }}>
             {state.alertEvent ? (
               <AlertCard event={state.alertEvent} onDismiss={() => setAlertEvent(null)} /> 
             ) : (
               <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 17, fontWeight: 600 }}>
                 NO ACTIVE INCIDENTS
               </div>
             )}
           </div>
           <div style={{ flex: 1.2 }}>
             <IncidentLog events={state.events} />
           </div>
           <div style={{ flex: 0.8 }}>
             <FeedbackPanel callId={state.activeCallId} />
           </div>
        </div>

    </div>
  )
}
