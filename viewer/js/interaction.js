import * as S from './state.js';
import { GRAPH_THRESHOLD, setGraphThreshold } from './config.js';
import { canvas, hitNode, drawGraph, expandNode, startSim, updateSelectionUI, showAllLinks, expandAllNeighbors, setDragNode, dragNode, setupCanvas, getRemainingNeighbors, setFocusedNode, clearFocusedNode, resetGraph, initGraphRoot } from './graph.js';
import { closeNodeCard, showNodeCard } from './node-card.js';
import { selectThought, hideMobileGraph } from './list.js';
import { apiFetch } from './api.js';

// ── Mobile back button ──
document.getElementById('btn-mobile-back').addEventListener('click', () => {
  hideMobileGraph();
});

let isPanning = false, panStartX = 0, panStartY = 0, panVpX = 0, panVpY = 0, panMoved = false;
let rectSelect = null;

// ── Mouse handlers ──
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  isPanning = false; panMoved = false;
  panStartX = e.clientX; panStartY = e.clientY;
  panVpX = S.vpX; panVpY = S.vpY;
  rectSelect = null;

  if (S.graphTool === 'pan') setDragNode(hitNode(e));
  else setDragNode(null);
});

canvas.addEventListener('mousemove', e => {
  if (e.buttons === 1) {
    const dx = e.clientX - panStartX, dy = e.clientY - panStartY;
    if (!panMoved && dx * dx + dy * dy > 9) { isPanning = true; panMoved = true; }
    if (isPanning) {
      if (S.graphTool === 'select') {
        const rect = canvas.getBoundingClientRect();
        rectSelect = { x1: panStartX - rect.left, y1: panStartY - rect.top, x2: e.clientX - rect.left, y2: e.clientY - rect.top };
        drawGraph();
        const ctx = canvas.getContext('2d');
        const r = rectSelect;
        ctx.strokeStyle = 'rgba(96,144,255,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
        ctx.fillStyle = 'rgba(96,144,255,0.08)';
        ctx.fillRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
        ctx.setLineDash([]);
      } else if (dragNode) {
        const rect = canvas.getBoundingClientRect();
        const [wx, wy] = S.s2w(e.clientX - rect.left, e.clientY - rect.top);
        dragNode.x = wx; dragNode.y = wy;
        dragNode.vx = 0; dragNode.vy = 0;
        canvas.style.cursor = 'grabbing';
        drawGraph();
      } else {
        const dx2 = e.clientX - panStartX, dy2 = e.clientY - panStartY;
        S.setVpX(panVpX + dx2); S.setVpY(panVpY + dy2);
        canvas.style.cursor = 'grabbing';
        drawGraph();
      }
      return;
    }
  }
  const node = hitNode(e);
  canvas.style.cursor = S.graphTool === 'select' ? 'default' : (node ? 'pointer' : 'grab');
});

canvas.addEventListener('mouseleave', () => {
  isPanning = false; setDragNode(null); rectSelect = null;
});

canvas.addEventListener('mouseup', e => {
  if (dragNode) { setDragNode(null); startSim(); }

  if (rectSelect && S.graphTool === 'select') {
    const r = rectSelect;
    const left = Math.min(r.x1, r.x2), right = Math.max(r.x1, r.x2);
    const top = Math.min(r.y1, r.y2), bottom = Math.max(r.y1, r.y2);
    if (!e.shiftKey) S.selectedNodes.clear();
    for (const node of S.gNodes.values()) {
      const [sx, sy] = S.w2s(node.x, node.y);
      if (sx >= left && sx <= right && sy >= top && sy <= bottom) S.selectedNodes.add(node.id);
    }
    updateSelectionUI();
    rectSelect = null;
    drawGraph();
  }

  if (!isPanning) canvas.style.cursor = S.graphTool === 'select' ? 'default' : 'grab';
  isPanning = false;
});

// ── Zoom ──
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  // ctrlKey = trackpad pinch (standard direction); otherwise scroll (flipped for natural scrolling)
  const factor = e.ctrlKey
    ? (e.deltaY < 0 ? 1.1 : 0.91)
    : (e.deltaY > 0 ? 1.1 : 0.91);
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const newScale = Math.max(0.15, Math.min(6, S.vpScale * factor));
  const ratio = newScale / S.vpScale;
  S.setVpX(mx - (mx - S.vpX) * ratio);
  S.setVpY(my - (my - S.vpY) * ratio);
  S.setVpScale(newScale);
  drawGraph();
}, { passive: false });

// ── Touch: pan + pinch-to-zoom ──
let touchStartDist = 0;
let touchStartScale = 1;
let touchStartMidX = 0, touchStartMidY = 0;
let touchStartVpX = 0, touchStartVpY = 0;
let singleTouchId = null;
let singleTouchStartX = 0, singleTouchStartY = 0;
let singleTouchVpX = 0, singleTouchVpY = 0;
let touchMoved = false;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    touchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    touchStartScale = S.vpScale;
    const rect = canvas.getBoundingClientRect();
    touchStartMidX = (t0.clientX + t1.clientX) / 2 - rect.left;
    touchStartMidY = (t0.clientY + t1.clientY) / 2 - rect.top;
    touchStartVpX = S.vpX;
    touchStartVpY = S.vpY;
    singleTouchId = null;
  } else if (e.touches.length === 1) {
    singleTouchId = e.touches[0].identifier;
    singleTouchStartX = e.touches[0].clientX;
    singleTouchStartY = e.touches[0].clientY;
    singleTouchVpX = S.vpX;
    singleTouchVpY = S.vpY;
    touchMoved = false;
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const scale = Math.max(0.15, Math.min(6, touchStartScale * (dist / touchStartDist)));
    const ratio = scale / touchStartScale;
    S.setVpX(touchStartMidX - (touchStartMidX - touchStartVpX) * ratio);
    S.setVpY(touchStartMidY - (touchStartMidY - touchStartVpY) * ratio);
    S.setVpScale(scale);
    drawGraph();
  } else if (e.touches.length === 1 && singleTouchId !== null) {
    const t = e.touches[0];
    const dx = t.clientX - singleTouchStartX;
    const dy = t.clientY - singleTouchStartY;
    if (dx * dx + dy * dy > 9) touchMoved = true;
    S.setVpX(singleTouchVpX + dx);
    S.setVpY(singleTouchVpY + dy);
    drawGraph();
  }
}, { passive: false });

// Long-press detection for context menu on mobile
let longPressTimer = null;
let longPressFired = false;

canvas.addEventListener('touchstart', e2 => {
  if (e2.touches.length !== 1) { clearTimeout(longPressTimer); return; }
  longPressFired = false;
  const touch = e2.touches[0];
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
    const node = hitNode(fakeEvent);
    if (node) showContextMenu(node, touch.clientX, touch.clientY);
  }, 500);
}, { passive: true });

canvas.addEventListener('touchmove', () => { clearTimeout(longPressTimer); }, { passive: true });

canvas.addEventListener('touchend', e => {
  clearTimeout(longPressTimer);
  if (e.touches.length === 0) {
    if (!touchMoved && !longPressFired && singleTouchId !== null) {
      const touch = e.changedTouches[0];
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
      const node = hitNode(fakeEvent);
      if (node) {
        // Tap on mobile: show card
        showCard(node);
      } else {
        closeNodeCard();
      }
    }
    singleTouchId = null;
  }
}, { passive: true });

// ── Tool switching ──
function setGraphToolUI(tool) {
  S.setGraphTool(tool);
  document.getElementById('tool-pan').classList.toggle('active', tool === 'pan');
  document.getElementById('tool-select').classList.toggle('active', tool === 'select');
  canvas.style.cursor = tool === 'pan' ? 'grab' : 'default';
}

document.getElementById('tool-pan').addEventListener('click', () => setGraphToolUI('pan'));
document.getElementById('tool-select').addEventListener('click', () => setGraphToolUI('select'));

// ── Show node card (click) ──
function showCard(node) {
  showNodeCard(node);
  setFocusedNode(node.id);
}

// ── Click = show card (pan) or select, Double-click = expand ──
let clickTimer = null;
let lastClickNode = null;

canvas.addEventListener('click', e => {
  if (panMoved) return;
  const node = hitNode(e);

  if (S.graphTool === 'select') {
    if (!node) { if (!e.shiftKey) { S.selectedNodes.clear(); updateSelectionUI(); drawGraph(); } return; }
    if (e.shiftKey) {
      if (S.selectedNodes.has(node.id)) S.selectedNodes.delete(node.id);
      else S.selectedNodes.add(node.id);
    } else {
      if (S.selectedNodes.has(node.id) && S.selectedNodes.size === 1) S.selectedNodes.clear();
      else { S.selectedNodes.clear(); S.selectedNodes.add(node.id); }
    }
    updateSelectionUI(); drawGraph();
    return;
  }

  // Pan mode: single click = show card, double click = expand
  if (!node) return; // don't close card on empty canvas click

  if (clickTimer && lastClickNode === node) {
    // Double click
    clearTimeout(clickTimer);
    clickTimer = null;
    lastClickNode = null;
    if (!node.expanded) expandNode(node.id);
  } else {
    // Start single click timer
    clearTimeout(clickTimer);
    lastClickNode = node;
    clickTimer = setTimeout(() => {
      clickTimer = null;
      lastClickNode = null;
      showCard(node);
    }, 250);
  }
});

// ── Context menu ──
const ctxMenu = document.getElementById('ctx-menu');
let ctxNode = null;

function showContextMenu(node, cx, cy) {
  closeNodeCard();
  ctxNode = node;
  // Update select/deselect label
  const selectItem = document.getElementById('ctx-select');
  selectItem.textContent = S.selectedNodes.has(node.id) ? 'Deselect' : 'Select';
  // Show/hide expand based on whether already expanded
  const expandItem = document.getElementById('ctx-expand');
  expandItem.style.display = node.expanded ? 'none' : 'block';
  // Show "Expand all neighbors (X remaining)" only if has remaining
  const expandAllItem = document.getElementById('ctx-expand-all');
  const remaining = getRemainingNeighbors(node);
  if (remaining !== null && remaining > 0) {
    expandAllItem.textContent = `Expand all neighbors (${remaining} remaining)`;
    expandAllItem.style.display = 'block';
  } else {
    expandAllItem.style.display = 'none';
  }

  ctxMenu.style.display = 'block';
  let lx = cx, ly = cy;
  requestAnimationFrame(() => {
    if (lx + ctxMenu.offsetWidth > window.innerWidth - 8) lx = cx - ctxMenu.offsetWidth;
    if (ly + ctxMenu.offsetHeight > window.innerHeight - 8) ly = window.innerHeight - ctxMenu.offsetHeight - 8;
    ctxMenu.style.left = lx + 'px'; ctxMenu.style.top = ly + 'px';
  });
}

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const node = hitNode(e);
  if (!node) { ctxMenu.style.display = 'none'; return; }
  showContextMenu(node, e.clientX, e.clientY);
});

document.addEventListener('click', () => { ctxMenu.style.display = 'none'; });
document.addEventListener('touchstart', e => {
  if (!ctxMenu.contains(e.target)) ctxMenu.style.display = 'none';
});
document.addEventListener('contextmenu', e => { if (!canvas.contains(e.target)) ctxMenu.style.display = 'none'; });

document.getElementById('ctx-expand').addEventListener('click', () => {
  if (!ctxNode) return;
  ctxMenu.style.display = 'none';
  if (!ctxNode.expanded) expandNode(ctxNode.id);
});

document.getElementById('ctx-expand-all').addEventListener('click', () => {
  if (!ctxNode) return;
  ctxMenu.style.display = 'none';
  expandAllNeighbors(ctxNode.id);
});

document.getElementById('ctx-show-links').addEventListener('click', () => {
  if (!ctxNode) return;
  ctxMenu.style.display = 'none';
  showAllLinks(ctxNode.id);
});

document.getElementById('ctx-select').addEventListener('click', () => {
  if (!ctxNode) return;
  ctxMenu.style.display = 'none';
  if (S.selectedNodes.has(ctxNode.id)) S.selectedNodes.delete(ctxNode.id);
  else S.selectedNodes.add(ctxNode.id);
  updateSelectionUI();
  drawGraph();
});

// ── Selection actions ──
document.getElementById('sel-delete').addEventListener('click', async () => {
  const ids = [...S.selectedNodes];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} thought${ids.length > 1 ? 's' : ''} permanently?`)) return;
  for (const id of ids) {
    await apiFetch(`/api/thoughts/${id}`, 'DELETE');
    S.setAllThoughts(S.allThoughts.filter(t => t.id !== id));
    S.gNodes.delete(id);
    for (const [key, edge] of S.gEdges) {
      if (edge.a === id || edge.b === id) S.gEdges.delete(key);
    }
  }
  S.selectedNodes.clear(); updateSelectionUI();
  const { renderList, updateFooter } = await import('./list.js');
  renderList(S.allThoughts); updateFooter(); drawGraph();
});

async function tagSelectedGroup(key, label) {
  const ids = [...S.selectedNodes];
  if (ids.length < 2) return;
  const thoughts = ids.map(id => S.gNodes.get(id)?.data).filter(Boolean);
  const groupId = crypto.randomUUID();
  for (const t of thoughts) {
    const meta = { ...(t.metadata || {}), [key]: groupId };
    await apiFetch(`/api/thoughts/${t.id}`, 'PATCH', { content: t.content, metadata: meta });
    t.metadata = meta;
  }
  S.selectedNodes.clear(); updateSelectionUI(); drawGraph();
  document.getElementById('graph-header-text').textContent = `${ids.length} thoughts queued for ${label}`;
  setTimeout(() => { document.getElementById('graph-header-text').textContent = ''; }, 3000);
}

document.getElementById('sel-merge').addEventListener('click', () => tagSelectedGroup('merge_group', 'merge'));
document.getElementById('sel-review').addEventListener('click', () => tagSelectedGroup('review_group', 're-evaluation'));

// ── Reset graph button ──
document.getElementById('btn-reset-graph').addEventListener('click', async () => {
  if (!S.selectedId) return;
  const root = S.gNodes.get(S.selectedId);
  resetGraph();
  if (root) { initGraphRoot(S.selectedId, root.data); await expandNode(S.selectedId); }
});

// ── Threshold vertical slider in graph header ──
const thresholdSlider = document.getElementById('graph-threshold');
const thresholdVal = document.getElementById('graph-threshold-val');
const thresholdPopup = document.getElementById('threshold-popup');
const thresholdToggle = document.getElementById('threshold-toggle');

thresholdSlider.value = Math.round(GRAPH_THRESHOLD * 100);
thresholdVal.textContent = Math.round(GRAPH_THRESHOLD * 100) + '%';

thresholdToggle.addEventListener('click', e => {
  e.stopPropagation();
  thresholdPopup.classList.toggle('open');
});

document.addEventListener('click', e => {
  if (!thresholdPopup.contains(e.target) && e.target !== thresholdToggle) {
    thresholdPopup.classList.remove('open');
  }
});

thresholdSlider.addEventListener('input', () => {
  thresholdVal.textContent = thresholdSlider.value + '%';
});

thresholdSlider.addEventListener('change', async () => {
  setGraphThreshold(parseInt(thresholdSlider.value) / 100);
  thresholdPopup.classList.remove('open');
  if (!S.selectedId) return;
  const root = S.gNodes.get(S.selectedId);
  resetGraph();
  if (root) { initGraphRoot(S.selectedId, root.data); await expandNode(S.selectedId); }
});

// ── Resize ──
window.addEventListener('resize', () => { setupCanvas(); drawGraph(); });
