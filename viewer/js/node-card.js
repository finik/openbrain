import { typeColor } from './config.js';
import * as S from './state.js';
import { apiFetch } from './api.js';
import { drawGraph } from './graph.js';
import { renderList, updateFooter } from './list.js';

const nodeCardEl = document.getElementById('node-card');
let _ncState = 'hidden'; // 'hidden', 'floating', 'pinned'
let _ncNode = null;
let ncEditing = false;

export function getNcState() { return _ncState; }
export function setNcState(v) { _ncState = v; }
export function getNcNode() { return _ncNode; }
export function setNcNode(v) { _ncNode = v; }

export function updateNodeCardContent(node) {
  _ncNode = node;
  const d = node.data, meta = d.metadata || {};
  document.querySelector('#nc-dot circle').setAttribute('fill', typeColor(meta.type || ''));
  document.getElementById('nc-title').textContent = d.title || '';
  document.getElementById('nc-text').textContent = d.content || '';
  const dateStr = d.created_at
    ? new Date(d.created_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  document.getElementById('nc-date').textContent = dateStr;
}

export function positionNodeCard(cx, cy) {
  nodeCardEl.style.display = 'block';
  requestAnimationFrame(() => {
    const cw = nodeCardEl.offsetWidth, ch = nodeCardEl.offsetHeight;
    let lx = cx + 4, ty = cy - 20;
    if (lx + cw > window.innerWidth - 8) lx = cx - cw - 4;
    if (ty + ch > window.innerHeight - 8) ty = window.innerHeight - ch - 8;
    if (ty < 4) ty = 4;
    nodeCardEl.style.left = lx + 'px';
    nodeCardEl.style.top = ty + 'px';
  });
}

let graphHoverTimer;
let graphHoverNode = null;

export function scheduleFloatingCard(e, node) {
  if (window.innerWidth <= 768) return; // no hover cards on mobile
  if (_ncState === 'pinned') return;
  if (document.getElementById('ctx-menu').style.display === 'block') return;
  graphHoverNode = node;
  clearTimeout(graphHoverTimer);
  clearTimeout(hideTimer);
  graphHoverTimer = setTimeout(() => {
    if (graphHoverNode !== node) return;
    updateNodeCardContent(node);
    nodeCardEl.classList.remove('pinned');
    _ncState = 'floating';
    positionNodeCard(e.clientX, e.clientY);
  }, 400);
}

export function cancelFloatingCard() {
  clearTimeout(graphHoverTimer);
  graphHoverNode = null;
}

let hideTimer;
export function scheduleHideFloatingCard() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (_ncState !== 'floating') return;
    nodeCardEl.style.display = 'none';
    _ncState = 'hidden';
    _ncNode = null;
  }, 400);
}

export function hideFloatingCard() {
  scheduleHideFloatingCard();
}

export function clearHideTimer() {
  clearTimeout(hideTimer);
}

nodeCardEl.addEventListener('mouseenter', () => { clearTimeout(hideTimer); });
nodeCardEl.addEventListener('mouseleave', () => { scheduleHideFloatingCard(); });

export function closeNodeCard() {
  if (ncEditing) cancelEdit();
  nodeCardEl.style.display = 'none';
  nodeCardEl.classList.remove('pinned');
  _ncState = 'hidden';
  _ncNode = null;
}

// ── Card action: Go To ──
document.getElementById('nc-goto').addEventListener('click', () => {
  if (!_ncNode) return;
  const { id, data } = _ncNode;
  closeNodeCard();
  import('./list.js').then(m => m.selectThought(id, data));
});

// ── Card action: Delete ──
document.getElementById('nc-delete').addEventListener('click', async () => {
  if (!_ncNode) return;
  if (!confirm('Delete this thought permanently?')) return;
  const id = _ncNode.id;
  const res = await apiFetch(`/api/thoughts/${id}`, 'DELETE');
  if (!res.ok) return;
  S.setAllThoughts(S.allThoughts.filter(t => t.id !== id));
  if (S.listMode === 'browse') { renderList(S.allThoughts); updateFooter(); }
  else renderList(S.allThoughts);
  S.gNodes.delete(id);
  for (const [key, edge] of S.gEdges) {
    if (edge.a === id || edge.b === id) S.gEdges.delete(key);
  }
  closeNodeCard();
  drawGraph();
});

// ── Card action: Edit ──
document.getElementById('nc-edit').addEventListener('click', () => {
  if (!_ncNode || ncEditing) return;
  ncEditing = true;
  const textEl = document.getElementById('nc-text');
  const content = _ncNode.data.content || '';
  const ta = document.createElement('textarea');
  ta.className = 'nc-edit-area';
  ta.id = 'nc-text';
  ta.value = content;
  textEl.replaceWith(ta);
  ta.focus();
  const editBtn = document.getElementById('nc-edit');
  editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#44cc88" stroke-width="2"><polyline points="3 8 7 12 13 4"/></svg>';
  editBtn.title = 'Save';
  editBtn.onclick = saveEdit;
});

async function saveEdit() {
  if (!_ncNode) return;
  const ta = document.getElementById('nc-text');
  const newContent = ta.value.trim();
  if (!newContent) return;
  const editBtn = document.getElementById('nc-edit');
  editBtn.style.color = '#888';
  const res = await apiFetch(`/api/thoughts/${_ncNode.id}`, 'PATCH', { content: newContent });
  if (!res.ok) { editBtn.style.color = '#ff6060'; return; }
  _ncNode.data.content = newContent;
  const t = S.allThoughts.find(t => t.id === _ncNode.id);
  if (t) t.content = newContent;
  renderList(S.allThoughts);
  cancelEdit();
  updateNodeCardContent(_ncNode);
}

function cancelEdit() {
  ncEditing = false;
  const ta = document.getElementById('nc-text');
  if (ta && ta.tagName === 'TEXTAREA') {
    const div = document.createElement('div');
    div.className = 'nc-text';
    div.id = 'nc-text';
    div.textContent = _ncNode?.data?.content || '';
    ta.replaceWith(div);
  }
  const editBtn = document.getElementById('nc-edit');
  editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z"/></svg>';
  editBtn.title = 'Edit';
  editBtn.onclick = null;
}

document.addEventListener('mousedown', e => {
  if (_ncState === 'pinned' && !nodeCardEl.contains(e.target) && e.target !== document.getElementById('graph-canvas')) {
    closeNodeCard();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNodeCard(); });
