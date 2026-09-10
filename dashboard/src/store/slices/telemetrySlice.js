import { HISTORY_MAX_WINDOWS, EVENT_LOG_MAX, THRESHOLD_HIGH, THRESHOLD_MEDIUM } from '../../lib/constants';

let peakRiskRef = {};
let windowCountRef = {};

export const createTelemetrySlice = (set, get) => ({
  activeCalls: {},
  focusedCallId: null,

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

  setFocusedCall: (callId) => {
    const callState = get().activeCalls[callId];
    if (callState) {
      set({ 
        focusedCallId: callId,
        activeCallId: callId,
        riskScore: callState.riskScore,
        signals: callState.signals,
        liveness: callState.liveness,
        callerIdentity: callState.callerIdentity,
        history: callState.history,
        latency: callState.latency,
      });
    }
  },

  setAlertEvent: (event) => set({ alertEvent: event }),
  setChallengeActive: (isActive) => set({ challengeActive: isActive }),

  resetTelemetry: () => {
    peakRiskRef = {};
    windowCountRef = {};
    set({
      activeCalls: {},
      focusedCallId: null,
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
    const callId = data.call_id || 'unknown';

    if (!peakRiskRef[callId]) peakRiskRef[callId] = 0;
    if (!windowCountRef[callId]) windowCountRef[callId] = 0;

    if (score > peakRiskRef[callId]) peakRiskRef[callId] = score;
    windowCountRef[callId] += 1;

    set((state) => {
      let nextAlertEvent = state.alertEvent;
      let nextHighRiskCount = state.highRiskCount;

      if (shouldAlert) {
        if (score >= THRESHOLD_HIGH) nextHighRiskCount += 1;
        nextAlertEvent = { ...data, timestamp: Date.now() };
      }

      const prevCallState = state.activeCalls[callId] || { history: [] };
      const newHistory = [...prevCallState.history, { t: timeStr.slice(3), score }].slice(-HISTORY_MAX_WINDOWS);

      const callState = {
        riskScore: score,
        signals: data.signals ?? {},
        liveness: data.signals?.liveness_score ?? null,
        callerIdentity: data.caller_identity_match_score ?? null,
        latency: data.latency_ms,
        history: newHistory,
        call_id: callId
      };

      const newActiveCalls = { ...state.activeCalls, [callId]: callState };
      
      const shouldFocus = !state.focusedCallId || state.focusedCallId === callId || Object.keys(state.activeCalls).length === 0;
      const focusedCallId = shouldFocus ? callId : state.focusedCallId;

      const newEvents = [{
        message: msg, time: timeStr, band, score: score / 100,
        risk_score: score, latency_ms: data.latency_ms,
        call_id: callId, window_index: data.window_index,
        signals: data.signals || {}
      }, ...state.events].slice(0, EVENT_LOG_MAX);

      if (shouldFocus) {
        return {
          activeCalls: newActiveCalls,
          focusedCallId,
          activeCallId: focusedCallId,
          riskScore: callState.riskScore,
          signals: callState.signals,
          liveness: callState.liveness,
          callerIdentity: callState.callerIdentity,
          history: callState.history,
          latency: callState.latency,
          sessionCount: state.sessionCount + 1,
          highRiskCount: nextHighRiskCount,
          alertEvent: nextAlertEvent,
          events: newEvents
        };
      } else {
        return {
          activeCalls: newActiveCalls,
          sessionCount: state.sessionCount + 1,
          highRiskCount: nextHighRiskCount,
          alertEvent: nextAlertEvent,
          events: newEvents
        };
      }
    });
  },

  getPeakRisk: (callId) => peakRiskRef[callId] || 0,
  getWindowCount: (callId) => windowCountRef[callId] || 0,
});
