import { create } from 'zustand';
import { createTelemetrySlice } from './slices/telemetrySlice';
import { createCallSlice } from './slices/callSlice';

// Initialize Web Worker for Phase 3
const worker = new Worker(new URL('../workers/dataWorker.js', import.meta.url), { type: 'module' });

export const useStore = create((set, get) => {
  // Listen for processed data from the Web Worker
  worker.onmessage = (e) => {
    if (e.data.type === 'TELEMETRY_PROCESSED') {
      get().processWorkerMessage(e.data.payload);
    } else if (e.data.type === 'CHALLENGE_RECEIVED') {
      get().setChallengeActive(true);
      // Optional: automatically turn off challenge active state after some time if we don't get a response
      setTimeout(() => get().setChallengeActive(false), 10000);
    }
  };

  return {
    ...createTelemetrySlice(set, get),
    ...createCallSlice(set, get),

    handleEvent: (data) => {
      // Phase 3: Offload heavy processing to Web Worker
      worker.postMessage({ type: 'PARSE_TELEMETRY', payload: data });
    },

    resetSession: () => {
      get().resetTelemetry();
      get().resetCalls();
    },
  };
});
