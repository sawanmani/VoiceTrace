import { THRESHOLD_LOW, THRESHOLD_MEDIUM, THRESHOLD_HIGH, COLOR_LOW, COLOR_MEDIUM, COLOR_HIGH, COLOR_MUTED } from './constants'

export function getRiskColor(score) {
  if (score < THRESHOLD_MEDIUM) return COLOR_LOW
  if (score < THRESHOLD_HIGH) return COLOR_MEDIUM
  return COLOR_HIGH
}

export function getRiskLabel(score) {
  if (score < THRESHOLD_MEDIUM) return 'GENUINE'
  if (score < THRESHOLD_HIGH) return 'UNCERTAIN'
  return 'SPOOFED'
}

export function getBandClass(score) {
  if (score < THRESHOLD_MEDIUM) return 'low'
  if (score < THRESHOLD_HIGH) return 'medium'
  return 'high'
}

export function formatTime(date) {
  // Respect user locale, or fallback to sensible default
  return date.toLocaleTimeString(undefined, { hour12: false })
}

export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function genCallId() {
  // Use crypto.randomUUID if available, else fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `call-${crypto.randomUUID().split('-')[0]}`
  }
  return `call-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`
}
