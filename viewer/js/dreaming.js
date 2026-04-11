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
      const bucket = bucketize(run.actions || {});
      const statsHtml = [
        bucket.merged ? `<span class="dream-run-stat">${bucket.merged} merged</span>` : '',
        bucket.deleted ? `<span class="dream-run-stat">${bucket.deleted} deleted</span>` : '',
        bucket.created ? `<span class="dream-run-stat">${bucket.created} new</span>` : '',
        bucket.memory ? `<span class="dream-run-stat">${bucket.memory} mem</span>` : '',
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

function bucketize(actionCounts) {
  const get = (k) => actionCounts[k] || 0;
  return {
    merged: get('merge'),
    deleted: get('delete'),
    created: get('create') + get('insight'),
    memory: get('promote') + get('evict'),
  };
}

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

  const buckets = {
    merged: [],       // merge
    deleted: [],      // delete
    created: [],      // create, insight
    memoryAdd: [],    // promote
    memoryRemove: [], // evict
    other: [],        // unknown / bump / keep / stale / test / ...
  };

  for (const e of entries) {
    const a = (e.action || '').toLowerCase();
    if (a === 'merge') buckets.merged.push(e);
    else if (a === 'delete') buckets.deleted.push(e);
    else if (a === 'create' || a === 'insight') buckets.created.push(e);
    else if (a === 'promote') buckets.memoryAdd.push(e);
    else if (a === 'evict') buckets.memoryRemove.push(e);
    else buckets.other.push(e);
  }

  // Summary stats — only the four headline sections
  let html = '<div class="dream-summary">';
  html += statCard(buckets.merged.length, 'Merged');
  html += statCard(buckets.deleted.length, 'Deleted');
  html += statCard(buckets.created.length, 'New');
  html += statCard(buckets.memoryAdd.length + buckets.memoryRemove.length, 'MEMORY.md');
  html += '</div>';

  html += '<div class="dream-sections">';

  // ── Section 1: Thoughts Merged ─────────────────────────────
  if (buckets.merged.length) {
    html += `<div class="dream-section"><div class="dream-section-title">Thoughts Merged (${buckets.merged.length})</div>`;
    for (const e of buckets.merged) {
      const d = e.detail || {};
      const finalId = e.thought_id || '';
      const after = d.after || '';
      const before = d.before || '';
      const sources = Array.isArray(d.source_ids) ? d.source_ids : [];
      const reason = d.reason || '';
      html += `<div class="dream-card dc-merged">`;
      html += `<div class="dc-head"><span class="dc-tag">final</span>${thoughtLink(finalId)}</div>`;
      if (after) html += `<div class="dc-body">${escHtml(after)}</div>`;
      if (before && before !== after) {
        html += `<div class="dc-sub"><span class="dc-label">was:</span> <span class="dc-muted">${escHtml(before)}</span></div>`;
      }
      if (sources.length) {
        const linksHtml = sources.map(sid => thoughtLink(sid)).join(' ');
        html += `<div class="dc-sub"><span class="dc-label">merged from:</span> ${linksHtml}</div>`;
      }
      if (reason) html += `<div class="dc-reason">${escHtml(reason)}</div>`;
      html += `</div>`;
    }
    html += '</div>';
  }

  // ── Section 2: Thoughts Deleted ────────────────────────────
  if (buckets.deleted.length) {
    html += `<div class="dream-section"><div class="dream-section-title">Thoughts Deleted (${buckets.deleted.length})</div>`;
    for (const e of buckets.deleted) {
      const d = e.detail || {};
      const snippet = d.content_snapshot || d.content || '';
      const reason = d.reason || '';
      html += `<div class="dream-card dc-deleted">`;
      if (snippet) html += `<div class="dc-body dc-strike">${escHtml(snippet)}</div>`;
      if (reason) html += `<div class="dc-reason">${escHtml(reason)}</div>`;
      html += `</div>`;
    }
    html += '</div>';
  }

  // ── Section 3: New Thoughts & Insights ─────────────────────
  if (buckets.created.length) {
    html += `<div class="dream-section"><div class="dream-section-title">New Thoughts & Insights (${buckets.created.length})</div>`;
    for (const e of buckets.created) {
      const d = e.detail || {};
      const kind = (e.action || '').toLowerCase();
      const content = d.content || d.text || d.title || '';
      const reason = d.reason || '';
      const urgency = d.urgency ? `<span class="dc-badge dc-badge-${escHtml(d.urgency)}">${escHtml(d.urgency)}</span>` : '';
      const tid = e.thought_id || '';
      html += `<div class="dream-card dc-created">`;
      html += `<div class="dc-head"><span class="dc-tag">${escHtml(kind)}</span>${urgency}${thoughtLink(tid)}</div>`;
      if (content) html += `<div class="dc-body">${escHtml(content)}</div>`;
      if (reason) html += `<div class="dc-reason">${escHtml(reason)}</div>`;
      html += `</div>`;
    }
    html += '</div>';
  }

  // ── Section 4: MEMORY.md changes ───────────────────────────
  if (buckets.memoryAdd.length || buckets.memoryRemove.length) {
    html += `<div class="dream-section"><div class="dream-section-title">MEMORY.md (${buckets.memoryAdd.length + buckets.memoryRemove.length})</div>`;

    if (buckets.memoryAdd.length) {
      html += `<div class="dream-subsection-title">+ Added (${buckets.memoryAdd.length})</div>`;
      for (const e of buckets.memoryAdd) {
        const d = e.detail || {};
        const tid = e.thought_id || '';
        html += `<div class="dream-card dc-mem-add">`;
        html += `<div class="dc-head">`;
        if (d.section) html += `<span class="dc-badge">${escHtml(d.section)}</span>`;
        html += thoughtLink(tid);
        html += `</div>`;
        if (d.reason) html += `<div class="dc-reason">${escHtml(d.reason)}</div>`;
        html += `</div>`;
      }
    }

    if (buckets.memoryRemove.length) {
      html += `<div class="dream-subsection-title">− Removed (${buckets.memoryRemove.length})</div>`;
      for (const e of buckets.memoryRemove) {
        const d = e.detail || {};
        const tid = e.thought_id || '';
        html += `<div class="dream-card dc-mem-remove">`;
        html += `<div class="dc-head">`;
        if (d.section) html += `<span class="dc-badge">${escHtml(d.section)}</span>`;
        html += thoughtLink(tid);
        html += `</div>`;
        if (d.reason) html += `<div class="dc-reason">${escHtml(d.reason)}</div>`;
        html += `</div>`;
      }
    }

    html += '</div>';
  }

  // ── Collapsible "Other" (bump/keep/stale/test/…) ───────────
  if (buckets.other.length) {
    const actionTally = {};
    for (const e of buckets.other) {
      actionTally[e.action] = (actionTally[e.action] || 0) + 1;
    }
    const tallyHtml = Object.entries(actionTally)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<span class="dc-badge">${escHtml(k)} ${v}</span>`)
      .join(' ');
    html += `<details class="dream-section dream-other"><summary class="dream-section-title">Other (${buckets.other.length}) ${tallyHtml}</summary>`;
    for (const e of buckets.other) {
      const d = e.detail || {};
      const tid = e.thought_id || '';
      const reason = d.reason || d.text || '';
      html += `<div class="dream-card dc-other">`;
      html += `<div class="dc-head"><span class="dc-tag">${escHtml(e.action || '')}</span>${thoughtLink(tid)}</div>`;
      if (reason) html += `<div class="dc-reason">${escHtml(reason)}</div>`;
      html += `</div>`;
    }
    html += '</details>';
  }

  html += '</div>';
  el.innerHTML = html;

  // Wire up thought links
  el.querySelectorAll('.dc-link').forEach(a => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const tid = a.dataset.tid;
      if (tid) openThought(tid, a);
    });
  });
}

function thoughtLink(id) {
  if (!id) return '';
  const short = escHtml(id.substring(0, 8));
  return `<a href="#" class="dc-link" data-tid="${escHtml(id)}" title="${escHtml(id)}">${short}</a>`;
}

async function openThought(id, anchorEl) {
  try {
    const res = await apiFetch(`/api/thoughts/${id}`);
    if (!res.ok) {
      anchorEl?.classList.add('dc-link-gone');
      if (anchorEl) anchorEl.title = 'Thought no longer exists';
      return;
    }
    const thought = await res.json();
    document.querySelector('.tab-btn[data-tab="thoughts"]')?.click();
    const { selectThought } = await import('./list.js');
    await selectThought(id, thought);
  } catch {
    anchorEl?.classList.add('dc-link-gone');
  }
}

function statCard(val, label) {
  return `<div class="dream-stat-card"><div class="dream-stat-val">${val}</div><div class="dream-stat-label">${escHtml(String(label))}</div></div>`;
}
