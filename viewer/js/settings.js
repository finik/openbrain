import { BRAIN_URL, BRAIN_KEY, EXPAND_LIMIT, setBrainUrl, setBrainKey, setExpandLimit } from './config.js';
import { resetBrowse } from './list.js';

export function populateSettings() {
  document.getElementById('s-url').value = BRAIN_URL;
  document.getElementById('s-key').value = BRAIN_KEY;
  document.getElementById('s-expand-limit').value = EXPAND_LIMIT;
  document.getElementById('s-expand-limit-val').textContent = EXPAND_LIMIT;
}

document.getElementById('s-expand-limit').addEventListener('input', e => {
  const val = parseInt(e.target.value);
  document.getElementById('s-expand-limit-val').textContent = val;
  setExpandLimit(val);
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

document.getElementById('s-demo').addEventListener('click', () => {
  window.location.search = 'demo';
});
