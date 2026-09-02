import { formatTime } from '../../lib/utils';
import { bandFromScore } from '../../lib/bandFromScore';

export const createCallSlice = (set, get) => ({
  completedCall: null,
  recentCalls: [],

  resetCalls: () => set({ completedCall: null }),

  // Hydrate recentCalls from GET /history on dashboard mount
  setRecentCalls: (calls) => set({ recentCalls: calls }),

  finalizeCall: (callId, durationSec) => {
    const peak = get().getPeakRisk();
    const windows = get().getWindowCount();
    
    const band = bandFromScore(peak);
    
    const callData = {
      call_id: callId || `call-${Math.floor(Math.random() * 10000)}`,
      peak_risk: peak,
      band,
      windows: windows,
      duration_sec: durationSec,
      time: formatTime(new Date()),
      completed: true,
    };
    
    set((state) => ({
      completedCall: callData,
      recentCalls: [callData, ...state.recentCalls].slice(0, 50)
    }));
  },
});
