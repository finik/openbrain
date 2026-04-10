import { typeColor, LIST_LIMIT } from './config.js';
import * as S from './state.js';
import { apiFetch } from './api.js';
import { escHtml } from './utils.js';
import { resetGraph, initGraphRoot, expandNode, setFocusedNode } from './graph.js';
import { showNodeCard } from './node-card.js';


// ── Spinner ──
function showSpinner(msg) {
  const el = document.getElementById('list-spinner');
  document.getElementById('spinner-msg').textContent = msg || 'Loading\u2026';
  el.classList.remove('hidden');
}
function hideSpinner() { document.getElementById('list-spinner').classList.add('hidden'); }

// ── List rendering ──
export async function loadNextPage() {
  if (S.listLoading || S.listMode !== 'browse') return;
  if (S.listPage > 0 && S.allThoughts.length >= S.listTotal) return;
  S.setListLoading(true);
  showSpinner(S.listPage === 0 ? 'Loading\u2026' : 'Loading more\u2026');
  const order = S.listSortAsc ? 'asc' : 'desc';
  const typeParam = S.typeFilter ? `&type=${S.typeFilter}` : '';
  const res = await apiFetch(`/api/thoughts?limit=${LIST_LIMIT}&page=${S.listPage}&order=${order}${typeParam}`);
  if (!res.ok) { S.setListLoading(false); hideSpinner(); return; }
  const data = await res.json();
  S.setListTotal(data.total);
  if (S.listPage === 0) {
    S.setAllThoughts(data.thoughts);
    renderList(S.allThoughts);
  } else {
    S.setAllThoughts(S.allThoughts.concat(data.thoughts));
    appendList(data.thoughts);
  }
  S.setListPage(S.listPage + 1);
  S.setListLoading(false);
  hideSpinner();
  updateFooter();
  document.getElementById('stat-count').textContent = `${S.listTotal} thoughts`;
}

export function updateFooter() {
  if (S.listMode === 'search') return;
  const more = S.allThoughts.length < S.listTotal;
  document.getElementById('list-footer-info').textContent =
    more ? `${S.allThoughts.length} of ${S.listTotal}` : `${S.allThoughts.length} thoughts`;
}

function appendList(rows) {
  const tbody = document.getElementById('list-body');
  for (const t of rows) tbody.appendChild(makeRow(t));
}

export function renderList(rows) {
  const tbody = document.getElementById('list-body');
  tbody.innerHTML = '';
  for (const t of rows) tbody.appendChild(makeRow(t));
}

function makeRow(t) {
  const tr = document.createElement('tr');
  tr.dataset.id = t.id;
  if (t.id === S.selectedId) tr.classList.add('selected');
  const type = t.metadata?.type || '';
  const d = new Date(t.created_at);
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const title = t.title || '';
  const contentPreview = title
    ? `<div class="td-title">${escHtml(title)}</div><div class="td-content">${escHtml(t.content.replace(/\n/g, ' '))}</div>`
    : `<div class="td-content">${escHtml(t.content.replace(/\n/g, ' '))}</div>`;
  tr.innerHTML = `
    <td class="td-dt">${datePart}<br>${timePart}</td>
    <td class="td-type" title="${type}"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="${typeColor(type)}"/></svg></td>
    <td>${contentPreview}</td>`;
  tr.addEventListener('click', () => selectThought(t.id, t));
  return tr;
}

// ── Mobile detection ──
function isMobile() { return window.innerWidth <= 768; }

export function showMobileGraph() {
  document.getElementById('thoughts-view').classList.add('mobile-graph');
  // Re-setup canvas after layout change
  import('./graph.js').then(m => { m.setupCanvas(); m.drawGraph(); });
}

export function hideMobileGraph() {
  document.getElementById('thoughts-view').classList.remove('mobile-graph');
}

// ── Selection & detail ──
export async function selectThought(id, data) {
  S.setSelectedId(id);
  document.querySelectorAll('#list-body tr').forEach(tr =>
    tr.classList.toggle('selected', tr.dataset.id === id));
  S.setVpX(0); S.setVpY(0); S.setVpScale(1);
  if (isMobile()) showMobileGraph();
  resetGraph();
  initGraphRoot(id, data);
  await expandNode(id);
  // Show card for the selected node
  const node = S.gNodes.get(id);
  if (node) {
    showNodeCard(node);
    setFocusedNode(id);
  }
}

// ── Search ──
export async function doSearch(q, limit) {
  S.setListMode('search'); S.setSearchQuery(q); S.setSearchLimit(limit);
  document.getElementById('btn-sort').classList.add('disabled');
  showSpinner('Searching\u2026');
  try {
    const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    const body = await res.json();
    hideSpinner();
    if (!res.ok) { document.getElementById('list-footer-info').textContent = `Error: ${body.error || res.status}`; return; }
    let results = body.results || [];
    if (S.typeFilter) results = results.filter(t => (t.metadata?.type || '') === S.typeFilter);
    S.setAllThoughts(results);
    renderList(results);
    const more = results.length >= limit;
    document.getElementById('list-footer-info').textContent = more ? `${results.length}+ results` : `${results.length} results`;
  } catch (err) {
    hideSpinner();
    document.getElementById('list-footer-info').textContent = 'Search failed';
  }
}

export function resetBrowse() {
  S.setListMode('browse'); S.setListPage(0); S.setAllThoughts([]); S.setListTotal(0);
  document.getElementById('list-body').innerHTML = '';
  document.getElementById('btn-sort').classList.remove('disabled');
  loadNextPage();
}

// ── Sort toggle ──
document.getElementById('btn-sort').addEventListener('click', () => {
  if (S.listMode === 'search') return;
  S.setListSortAsc(!S.listSortAsc);
  document.getElementById('btn-sort').innerHTML = S.listSortAsc ? '&#8593;' : '&#8595;';
  resetBrowse();
});

// ── Search input ──
let searchTimer;
document.getElementById('search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = document.getElementById('search-input').value.trim();
  if (!q) { resetBrowse(); return; }
  searchTimer = setTimeout(() => doSearch(q, 50), 400);
});

// ── Type filter ──
document.getElementById('type-filter').addEventListener('change', () => {
  S.setTypeFilter(document.getElementById('type-filter').value);
  const q = document.getElementById('search-input').value.trim();
  if (q) doSearch(q, 50);
  else resetBrowse();
});

// ── Infinite scroll ──
const scrollObserver = new IntersectionObserver(entries => {
  if (!entries[0].isIntersecting) return;
  if (S.listMode === 'browse') loadNextPage();
  else if (S.listMode === 'search' && S.allThoughts.length >= S.searchLimit) doSearch(S.searchQuery, S.searchLimit + 50);
}, { root: document.getElementById('list-scroll'), threshold: 0.1 });
scrollObserver.observe(document.getElementById('scroll-sentinel'));
