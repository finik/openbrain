import { BRAIN_URL, BRAIN_KEY, isDemoMode } from './config.js';
import { setupCanvas, drawGraph } from './graph.js';
import { loadNextPage } from './list.js';
import { populateSettings } from './settings.js';
import { initTabs } from './tabs.js';
import { setupResizablePanes } from './resize.js';
import './interaction.js';
import './node-card.js';

(async () => {
  setupCanvas();
  drawGraph();
  setupResizablePanes();

  // Re-setup canvas when panes are resized
  window.addEventListener('pane-resize', () => { setupCanvas(); drawGraph(); });
  initTabs();

  if (isDemoMode()) {
    // ?demo in URL — load mock data
    const banner = document.getElementById('demo-banner');
    if (banner) banner.style.display = 'flex';
    await loadNextPage();
  } else if (BRAIN_URL && BRAIN_KEY) {
    // Credentials in localStorage — live mode
    await loadNextPage();
  } else {
    // No credentials, no demo — show settings
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.getElementById('thoughts-view').classList.add('hidden');
    document.getElementById('settings-view').classList.add('active');
    populateSettings();
  }
})();
