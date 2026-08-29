import { formatTime } from '../lib/utils';
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM, ALERT_MEDIUM_PROB } from '../lib/constants';

// Simulated heavy processing (e.g. FFT calculation, tensor processing)
function simulateHeavyProcessing() {
  let temp = 0;
  // A tiny loop to simulate computational load without completely freezing the worker
  for (let i = 0; i < 50000; i++) {
    temp += Math.sqrt(i);
  }
  return temp;
}

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === 'PARSE_TELEMETRY') {
    try {
      // 1. Heavy JSON Parsing
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      
      if (data.type && data.type !== 'risk_event') return;

      // 2. Heavy calculations offloaded from main thread
      simulateHeavyProcessing();

      const score = data.risk_score ?? 0;
      const band = data.band ?? 'low';

      // Calculate alert conditions
      let shouldAlert = false;
      if (score >= THRESHOLD_HIGH) {
        shouldAlert = true;
      } else if (score >= THRESHOLD_MEDIUM && Math.random() < ALERT_MEDIUM_PROB) {
        shouldAlert = true;
      }

      // Calculate messages
      const messages = {
        low:      ['Genuine voice detected', 'Speaker verified', 'Natural speech confirmed'],
        uncertain: ['Borderline — monitoring closely', 'Ambiguous pattern, continuing analysis'],
        medium:   ['Borderline signal — monitoring', 'Ambiguous pattern detected'],
        high:     ['\u26a0 Clone signature detected', '\U0001f6a8 High spoof probability', 'AI-generated voice suspected'],
      };
      const msgList = messages[band] ?? messages.low;
      const msg = msgList[(data.window_index ?? 0) % msgList.length];

      const t = formatTime(new Date());

      // 3. Post computed state slice back to main thread
      self.postMessage({
        type: 'TELEMETRY_PROCESSED',
        payload: {
          data, // original
          score,
          band,
          shouldAlert,
          msg,
          timeStr: t,
        }
      });
    } catch (err) {
      console.error('Worker JSON Parse Error:', err);
    }
  }
};
