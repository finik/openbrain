import { escHtml } from './utils.js';
import { apiFetch } from './api.js';

let dreamingLoaded = false;

export async function checkDreamingAvailable() {
  try {
    const res = await apiFetch('/api/dream-runs');
    if (res.ok) {
      const data = await res.json();
      if (data.runs && data.runs.length > 0) {
        document.getElementById('tab-dreaming').style.display = '';
      }
    }
  } catch (e) { /* not available */ }
}

export async function loadDreamingList() {
  const listEl = document.getElementById('dream-list');
  listEl.innerHTML = '<div style="padding:20px;color:#444;font-size:11px">Loading\u2026</div>';
  try {
    const res = await apiFetch('/api/dream-runs');
    const { runs } = await res.json();
    dreamingLoaded = true;
    listEl.innerHTML = '';
    for (const run of runs) {
      const el = document.createElement('div');
      el.className = 'dream-run';
      el.dataset.date = run.run_date;
      const actions = run.actions || {};
      const statsHtml = [
        run.total ? `<span class="dream-run-stat">${run.total} actions</span>` : '',
        actions.keep ? `<span class="dream-run-stat">${actions.keep} kept</span>` : '',
        actions.bump ? `<span class="dream-run-stat">${actions.bump} bumped</span>` : '',
        actions.delete ? `<span class="dream-run-stat">${actions.delete} deleted</span>` : '',
        actions.merge ? `<span class="dream-run-stat">${actions.merge} merged</span>` : '',
        actions.augment ? `<span class="dream-run-stat">${actions.augment} augmented</span>` : '',
        actions.insight ? `<span class="dream-run-stat">${actions.insight} insights</span>` : '',
      ].filter(Boolean).join('');
      el.innerHTML = `<div class="dream-run-date">${run.run_date}</div><div class="dream-run-stats">${statsHtml || '<span style="color:#333">\u2014</span>'}</div>`;
      el.addEventListener('click', () => {
        listEl.querySelectorAll('.dream-run').forEach(r => r.classList.remove('active'));
        el.classList.add('active');
        loadDreamingDetail(run.run_date);
      });
      listEl.appendChild(el);
    }
    if (!runs.length) listEl.innerHTML = '<div style="padding:20px;color:#444;font-size:11px">No dreaming logs found</div>';
  } catch (e) {
    listEl.innerHTML = '<div style="padding:20px;color:#666;font-size:11px">Failed to load dreaming logs</div>';
  }
}

export function isDreamingLoaded() { return dreamingLoaded; }

async function loadDreamingDetail(runDate) {
  const detailEl = document.getElementById('dream-detail');
  detailEl.innerHTML = '<div style="padding:20px;color:#444;font-size:11px">Loading\u2026</div>';
  try {
    const res = await apiFetch(`/api/dream-log?run_date=${runDate}`);
    const data = await res.json();
    if (data.error) { detailEl.innerHTML = `<div class="dream-detail-empty">${escHtml(data.error)}</div>`; return; }
    renderDreamingDetail(data.entries || [], detailEl);
  } catch (e) {
    detailEl.innerHTML = '<div class="dream-detail-empty">Failed to load</div>';
  }
}

function renderDreamingDetail(entries, el) {
  if (!entries.length) {
    el.innerHTML = '<div class="dream-detail-empty">No entries for this date</div>';
    return;
  }

  // Summary stats
  const actionCounts = {};
  for (const e of entries) {
    actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
  }

  let html = '<div class="dream-summary">';
  html += statCard(entries.length, 'Total');
  for (const [action, count] of Object.entries(actionCounts).sort((a, b) => b[1] - a[1])) {
    html += statCard(count, action);
  }
  html += '</div>';

  // Group entries by step
  const byStep = new Map();
  for (const e of entries) {
    const step = e.step ?? '?';
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step).push(e);
  }

  const stepNames = {
    1: 'Process Thoughts',
    2: 'Generate Insights',
    3: 'Task Cleanup',
    4: 'First-Tier Memory',
    5: 'Final',
  };

  html += '<div class="dream-sections">';
  for (const [step, stepEntries] of byStep) {
    const title = stepNames[step] || `Step ${step}`;
    html += `<div class="dream-section"><div class="dream-section-title">${escHtml(title)} (${stepEntries.length})</div>`;
    for (const entry of stepEntries) {
      const cls = actionClass(entry.action);
      const detail = entry.detail || {};
      const reason = detail.reason || detail.title || '';
      const thoughtSnippet = detail.content ? detail.content.substring(0, 80) : '';
      const idShort = entry.thought_id ? entry.thought_id.substring(0, 8) : '';

      let line = `<strong>${escHtml(entry.action)}</strong>`;
      if (idShort) line += ` <span style="color:#555">${idShort}</span>`;
      if (thoughtSnippet) line += ` — ${escHtml(thoughtSnippet)}`;
      if (reason) line += ` <span style="color:#666;font-style:italic">(${escHtml(reason)})</span>`;

      html += `<div class="dream-line ${cls}">${line}</div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function actionClass(action) {
  const a = (action || '').toLowerCase();
  if (a.includes('delete') || a === 'evict') return 'dream-line-delete';
  if (a.includes('augment') || a === 'merge') return 'dream-line-augment';
  if (a.includes('insight') || a === 'create') return 'dream-line-insight';
  if (a.includes('keep') || a.includes('bump') || a === 'promote') return 'dream-line-keep';
  return '';
}

function statCard(val, label) {
  return `<div class="dream-stat-card"><div class="dream-stat-val">${val}</div><div class="dream-stat-label">${escHtml(String(label))}</div></div>`;
}
