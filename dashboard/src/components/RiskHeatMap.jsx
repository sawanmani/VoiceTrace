import React from 'react';
import { getRiskColor } from '../lib/utils';

const SIGNAL_TYPES = [
  { id: 'liveness_score', label: 'Liveness' },
  { id: 'spectral_artifact_score', label: 'Spectral' },
  { id: 'phase_artifact_score', label: 'Phase' },
  { id: 'gan_artifact_score', label: 'GAN Artifact' },
  { id: 'prosody_anomaly_score', label: 'Prosody' }
];

const getHeatColor = (score) => {
  const s = score || 0;
  if (s < 30) return `rgba(16, 185, 129, ${Math.max(0.1, s/100)})`;
  if (s < 70) return `rgba(245, 158, 11, ${Math.max(0.3, s/100)})`;
  return `rgba(239, 68, 68, ${Math.max(0.5, s/100)})`;
};

export default function RiskHeatMap({ events = [], activeCallId }) {
  const callEvents = events.filter(e => e.call_id === activeCallId);
  const recentEvents = [...callEvents].slice(0, 20).reverse();

  if (recentEvents.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-full min-h-[220px] border border-[var(--border)] rounded overflow-hidden p-6 bg-[var(--bg-card)]">
         <div className="text-[var(--text-muted)] text-sm font-semibold tracking-wider">WAITING FOR TELEMETRY...</div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col h-full bg-[var(--bg-card)] border border-[var(--border)] rounded p-4 min-h-[220px]">
      <div className="text-[17px] font-black tracking-wide mb-4 flex items-center justify-between uppercase">
        Risk Attribution Heat Map
        <span className="text-[10px] bg-white/5 text-white/50 px-2 py-1 rounded border border-white/10">LAST {recentEvents.length} WIN</span>
      </div>
      
      <div className="flex-1 flex flex-col gap-[3px] relative justify-center">
        {SIGNAL_TYPES.map(sig => (
          <div key={sig.id} className="flex items-center gap-3">
            <div className="w-24 text-[11px] font-bold text-[var(--text-secondary)] text-right uppercase tracking-wider">
              {sig.label}
            </div>
            <div className="flex-1 flex gap-[2px] h-7">
              {recentEvents.map((evt, i) => {
                const val = evt.signals?.[sig.id] ?? 0;
                const intensity = sig.id === 'liveness_score' ? (100 - val) : val;
                
                return (
                  <div 
                    key={`${evt.window_index}-${i}`} 
                    className="flex-1 rounded-[2px] transition-colors duration-500 ease-out group relative cursor-crosshair"
                    style={{ backgroundColor: getHeatColor(intensity) }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                      {sig.label}: {Math.round(val)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
