import { BRAIN_URL, BRAIN_KEY, GRAPH_THRESHOLD, setBrainUrl, setBrainKey, setGraphThreshold } from './config.js';
import { resetBrowse } from './list.js';

export function populateSettings() {
  document.getElementById('s-url').value = BRAIN_URL;
  document.getElementById('s-key').value = BRAIN_KEY;
  document.getElementById('s-threshold').value = Math.round(GRAPH_THRESHOLD * 100);
  document.getElementById('s-threshold-val').textContent = Math.round(GRAPH_THRESHOLD * 100) + '%';
}

document.getElementById('s-threshold').addEventListener('input', e => {
  const val = parseInt(e.target.value);
  document.getElementById('s-threshold-val').textContent = val + '%';
  setGraphThreshold(val / 100);
});

document.getElementById('s-save').addEventListener('click', () => {
  setBrainUrl(document.getElementById('s-url').value.trim().replace(/\/+$/, ''));
  setBrainKey(document.getElementById('s-key').value.trim());
  // Switch to thoughts tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="thoughts"]').classList.add('active');
  document.getElementById('thoughts-view').classList.remove('hidden');
  document.getElementById('settings-view').classList.remove('active');
  resetBrowse();
});
