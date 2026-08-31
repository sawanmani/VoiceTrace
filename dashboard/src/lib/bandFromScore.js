/**
 * dashboard/src/lib/bandFromScore.js
 *
 * Frontend equivalent of Python's risk_engine.band_from_score().
 * Keeps threshold logic in a single place — callSlice.js and any
 * other consumer import from here instead of inlining the ternary chain.
 *
 * ⚠ KEEP IN SYNC WITH server/risk_engine.py:band_from_score()
 * If thresholds in constants.js or risk_engine.py change, update BOTH files.
 */
import { THRESHOLD_HIGH, THRESHOLD_MEDIUM, THRESHOLD_UNCERTAIN } from './constants';

/**
 * @param {number} score  0–100 risk score
 * @returns {'high'|'medium'|'uncertain'|'low'}
 */
export function bandFromScore(score) {
  if (score >= THRESHOLD_HIGH)      return 'high';
  if (score >= THRESHOLD_MEDIUM)    return 'medium';
  if (score >= THRESHOLD_UNCERTAIN) return 'uncertain';
  return 'low';
}
