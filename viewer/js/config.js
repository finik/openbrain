// ── Config from localStorage ──
export let BRAIN_URL = localStorage.getItem('brain_url') || '';
export let BRAIN_KEY = localStorage.getItem('brain_key') || '';
export let GRAPH_THRESHOLD = parseFloat(localStorage.getItem('graph_threshold') || '0.3');

export function setBrainUrl(v) { BRAIN_URL = v; localStorage.setItem('brain_url', v); }
export function setBrainKey(v) { BRAIN_KEY = v; localStorage.setItem('brain_key', v); }
export function setGraphThreshold(v) { GRAPH_THRESHOLD = v; localStorage.setItem('graph_threshold', v); }

// ── Constants ──
export const TYPE_COLORS = { task: '#ff9a3c', note: '#8888cc' };
export const typeColor = t => TYPE_COLORS[t] || '#666688';
export const LIST_LIMIT = 100;

// ── Demo mode ──
// Only ?demo query param triggers demo mode. Credentials in localStorage = live. Neither = settings.
export function isDemoMode() {
  return new URLSearchParams(window.location.search).has('demo');
}
