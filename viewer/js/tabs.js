import { setupCanvas, drawGraph } from './graph.js';
import { checkDreamingAvailable, loadDreamingList, isDreamingLoaded } from './dreaming.js';
import { populateSettings } from './settings.js';

export function initTabs() {
  checkDreamingAvailable();

  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('thoughts-view').classList.toggle('hidden', tab !== 'thoughts');
    document.getElementById('dreaming-view').classList.toggle('active', tab === 'dreaming');
    document.getElementById('settings-view').classList.toggle('active', tab === 'settings');
    if (tab === 'dreaming' && !isDreamingLoaded()) loadDreamingList();
    if (tab === 'settings') populateSettings();
    if (tab === 'thoughts') { setupCanvas(); drawGraph(); }
  }));
}
