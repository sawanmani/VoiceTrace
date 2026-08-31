import { formatTime } from '../../lib/utils';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM, THRESHOLD_UNCERTAIN } from '../../lib/constants';

export const createCallSlice = (set, get) => ({
  completedCall: null,
  recentCalls: [],

  resetCalls: () => set({ completedCall: null }),

  // Hydrate recentCalls from GET /history on dashboard mount
  setRecentCalls: (calls) => set({ recentCalls: calls }),

  finalizeCall: (callId, durationSec) => {
    const peak = get().getPeakRisk();
    const windows = get().getWindowCount();
    
    const band = peak >= THRESHOLD_HIGH    ? 'high'
               : peak >= THRESHOLD_MEDIUM  ? 'medium'
               : peak >= THRESHOLD_UNCERTAIN ? 'uncertain'
               : 'low';
    
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
