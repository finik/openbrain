import { escHtml } from './utils.js';

let dreamingLoaded = false;

export async function checkDreamingAvailable() {
  try {
    const res = await fetch('/api/dreaming/list');
    if (res.ok) {
      const data = await res.json();
      if (data.runs && !data.error) {
        document.getElementById('tab-dreaming').style.display = '';
      }
    }
  } catch (e) { /* not available */ }
}

export async function loadDreamingList() {
  const listEl = document.getElementById('dream-list');
  listEl.innerHTML = '<div style="padding:20px;color:#444;font-size:11px">Loading\u2026</div>';
  try {
    const res = await fetch('/api/dreaming/list');
    const { runs } = await res.json();
    dreamingLoaded = true;
    listEl.innerHTML = '';
    for (const run of runs) {
      const el = document.createElement('div');
      el.className = 'dream-run';
      el.dataset.date = run.date;
      const s = run.summary || {};
      const statsHtml = [
        s.total_working ? `<span class="dream-run-stat">${s.total_working} thoughts</span>` : '',
        s.actions ? `<span class="dream-run-stat">${s.actions} actions</span>` : '',
        s.insights ? `<span class="dream-run-stat">${s.insights} insights</span>` : '',
      ].filter(Boolean).join('');
      el.innerHTML = `<div class="dream-run-date">${run.date}</div><div class="dream-run-stats">${statsHtml || '<span style="color:#333">\u2014</span>'}</div>`;
      el.addEventListener('click', () => {
        listEl.querySelectorAll('.dream-run').forEach(r => r.classList.remove('active'));
        el.classList.add('active');
        loadDreamingDetail(run.date);
      });
      listEl.appendChild(el);
    }
    if (!runs.length) listEl.innerHTML = '<div style="padding:20px;color:#444;font-size:11px">No dreaming logs found</div>';
  } catch (e) {
    listEl.innerHTML = '<div style="padding:20px;color:#666;font-size:11px">Failed to load dreaming logs</div>';
  }
}

export function isDreamingLoaded() { return dreamingLoaded; }

async function loadDreamingDetail(date) {
  const detailEl = document.getElementById('dream-detail');
  detailEl.innerHTML = '<div style="padding:20px;color:#444;font-size:11px">Loading\u2026</div>';
  try {
    const res = await fetch(`/api/dreaming/${date}`);
    const data = await res.json();
    if (data.error) { detailEl.innerHTML = `<div class="dream-detail-empty">${escHtml(data.error)}</div>`; return; }
    renderDreamingDetail(data, detailEl);
  } catch (e) {
    detailEl.innerHTML = '<div class="dream-detail-empty">Failed to load</div>';
  }
}

function renderDreamingDetail(data, el) {
  const s = data.sections || [];
  let html = '';

  const raw = data.raw || '';
  const totalMatch = raw.match(/Total working list:\s*(\d+)/);
  const deletedMatches = raw.match(/(\d+)\s+deleted/gi) || [];
  let totalDeleted = 0;
  for (const m of deletedMatches) { const n = parseInt(m); if (!isNaN(n)) totalDeleted += n; }
  const augmentedMatches = raw.match(/(\d+)\s+augmented/gi) || [];
  let totalAugmented = 0;
  for (const m of augmentedMatches) { const n = parseInt(m); if (!isNaN(n)) totalAugmented += n; }
  const insightCount = (raw.match(/urgency:(high|medium|low)/g) || []).length;
  const highCount = (raw.match(/urgency:high/g) || []).length;

  html += '<div class="dream-summary">';
  if (totalMatch) html += statCard(totalMatch[1], 'Processed');
  if (totalDeleted) html += statCard(totalDeleted, 'Deleted');
  if (totalAugmented) html += statCard(totalAugmented, 'Augmented');
  if (insightCount) html += statCard(insightCount, highCount ? `Insights (${highCount} high)` : 'Insights');
  html += '</div>';

  html += '<div class="dream-sections">';
  for (const sec of s) {
    if (sec.type === 'title') {
      html += `<h2 style="font-size:15px;color:#8080b0;margin-bottom:12px;font-weight:600">${escHtml(sec.text)}</h2>`;
    } else if (sec.type === 'section') {
      html += `<div class="dream-section"><div class="dream-section-title">${escHtml(sec.title)}</div>`;
      html += renderDreamLines(sec.lines);
      html += '</div>';
    } else if (sec.type === 'subsection') {
      html += `<div class="dream-subsection-title">${escHtml(sec.title)}</div>`;
      html += renderDreamLines(sec.lines);
    }
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderDreamLines(lines) {
  return lines.map(line => {
    let cls = 'dream-line';
    const lower = line.toLowerCase();
    if (lower.includes('delet') || lower.includes('removed')) cls += ' dream-line-delete';
    else if (lower.includes('augment') || lower.includes('merged') || lower.includes('updated')) cls += ' dream-line-augment';
    else if (lower.includes('insight') || lower.includes('urgency:')) cls += ' dream-line-insight';
    else if (lower.includes('kept') || lower.includes('bumped')) cls += ' dream-line-keep';
    const formatted = escHtml(line).replace(/\b([0-9a-f]{7,8}(?:-[0-9a-f]{4})?)\b/g, '<strong>$1</strong>');
    return `<div class="${cls}">${formatted}</div>`;
  }).join('');
}

function statCard(val, label) {
  return `<div class="dream-stat-card"><div class="dream-stat-val">${val}</div><div class="dream-stat-label">${label}</div></div>`;
}
