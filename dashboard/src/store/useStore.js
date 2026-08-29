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
