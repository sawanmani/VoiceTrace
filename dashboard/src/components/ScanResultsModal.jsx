import React from 'react';
import { X, ShieldAlert, ShieldCheck, Activity } from 'lucide-react';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../lib/constants';
import { getRiskColor } from '../lib/utils';
import { bandFromScore } from '../lib/bandFromScore';

export default function ScanResultsModal({ data, onClose }) {
  if (!data) return null;

  const peakScore = Math.max(...(data.windows || []).map(w => w.score || 0));
  const band = bandFromScore(peakScore);
  const color = getRiskColor(peakScore);
  const isHighRisk = peakScore >= THRESHOLD_HIGH;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>
              {isHighRisk ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 m-0">Static Scan Results</h2>
              <p className="text-xs text-gray-500 m-0">File analysis complete</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 text-center">
              <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Peak Risk Score</div>
              <div className="text-5xl font-black font-mono" style={{ color }}>{peakScore}</div>
              <div className="text-sm font-bold mt-2" style={{ color }}>{band} RISK</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 text-center flex flex-col justify-center">
              <div className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Windows Analyzed</div>
              <div className="text-3xl font-bold text-gray-800">{data.windows?.length || 0}</div>
              <div className="text-sm text-gray-500 mt-1">~{((data.windows?.length || 0) * 0.5).toFixed(1)}s audio</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity size={16} /> Timeline Breakdown
            </div>
            <div className="flex gap-1 h-16 items-end bg-gray-50 p-2 rounded-lg border border-gray-100">
              {(data.windows || []).map((w, i) => {
                const h = Math.max(10, w.score);
                const barColor = getRiskColor(w.score);
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end group relative">
                    <div 
                      className="w-full rounded-t-sm transition-all duration-300 hover:opacity-80" 
                      style={{ height: `${h}%`, backgroundColor: barColor }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      Window {i+1}: {w.score}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-lg transition-colors">
            Close Report
          </button>
        </div>

      </div>
    </div>
  );
}
