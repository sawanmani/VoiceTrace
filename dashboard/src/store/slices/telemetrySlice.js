import { HISTORY_MAX_WINDOWS, EVENT_LOG_MAX, THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../../lib/constants';

let peakRiskRef = 0;
let windowCountRef = 0;

export const createTelemetrySlice = (set, get) => ({
  riskScore: 0,
  signals: {},
  liveness: null,
  callerIdentity: null,
  activeCallId: null,
  history: [],
  events: [],
  sessionCount: 0,
  highRiskCount: 0,
  latency: null,
  alertEvent: null,
  challengeActive: false,

  setAlertEvent: (event) => set({ alertEvent: event }),
  setChallengeActive: (isActive) => set({ challengeActive: isActive }),

  resetTelemetry: () => {
    peakRiskRef = 0;
    windowCountRef = 0;
    set({
      history: [],
      events: [],
      sessionCount: 0,
      highRiskCount: 0,
      riskScore: 0,
      signals: {},
      liveness: null,
      callerIdentity: null,
      activeCallId: null,
      latency: null,
      alertEvent: null,
      challengeActive: false,
    });
  },

  processWorkerMessage: (payload) => {
    const { data, score, band, shouldAlert, msg, timeStr } = payload;
    
    if (score > peakRiskRef) peakRiskRef = score;
    windowCountRef += 1;

    set((state) => {
      let nextAlertEvent = state.alertEvent;
      let nextHighRiskCount = state.highRiskCount;

      if (shouldAlert) {
        if (score >= THRESHOLD_HIGH) nextHighRiskCount += 1;
        nextAlertEvent = { ...data, timestamp: Date.now() };
      }

      return {
        riskScore: score,
        signals: data.signals ?? {},
        liveness: data.signals?.liveness_score ?? null,
        callerIdentity: data.caller_identity_match_score ?? null,
        activeCallId: data.call_id ?? state.activeCallId,
        latency: data.latency_ms,
        sessionCount: state.sessionCount + 1,
        highRiskCount: nextHighRiskCount,
        alertEvent: nextAlertEvent,
        history: [...state.history, { t: timeStr.slice(3), score }].slice(-HISTORY_MAX_WINDOWS),
        events: [{
          message: msg, time: timeStr, band, score: score / 100,
          risk_score: score, latency_ms: data.latency_ms,
          call_id: data.call_id, window_index: data.window_index
        }, ...state.events].slice(0, EVENT_LOG_MAX)
      };
    });
  },

  getPeakRisk: () => peakRiskRef,
  getWindowCount: () => windowCountRef,
});
