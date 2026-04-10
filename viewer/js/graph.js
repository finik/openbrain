import { GRAPH_THRESHOLD, EXPAND_LIMIT, typeColor } from './config.js';
import * as S from './state.js';
import { apiFetch } from './api.js';

// ── Loading spinner state ──
let loadingNodeId = null;
let loadingAngle = 0;
let loadingAnimFrame = null;

function animateLoadingSpinner() {
  loadingAngle += 0.08;
  drawGraph();
  if (loadingNodeId) loadingAnimFrame = requestAnimationFrame(animateLoadingSpinner);
}
function startLoadingSpinner(id) {
  loadingNodeId = id;
  loadingAngle = 0;
  if (!loadingAnimFrame) loadingAnimFrame = requestAnimationFrame(animateLoadingSpinner);
}
function stopLoadingSpinner() {
  loadingNodeId = null;
  if (loadingAnimFrame) { cancelAnimationFrame(loadingAnimFrame); loadingAnimFrame = null; }
}

// ── Canvas setup ──
const canvas = document.getElementById('graph-canvas');
const ctx = canvas.getContext('2d');
export let hitTargets = [];

export function setupCanvas() {
  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return false;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return true;
}

// ── Graph data model ──
export function resetGraph() {
  S.gNodes.clear(); S.gEdges.clear();
  S.selectedNodes.clear(); updateSelectionUI();
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  document.getElementById('btn-reset-graph').style.display = 'none';
  drawGraph();
}

export function initGraphRoot(id, data) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  S.gNodes.set(id, {
    id, x: W / 2, y: H / 2, vx: 0, vy: 0,
    data: data || { id, content: '', metadata: {}, created_at: '' },
    expanded: false, totalNeighbors: null,
  });
  fetchTotalNeighbors(id);
}

export function addGraphEdge(aId, bId, similarity) {
  const key = [aId, bId].sort().join('|');
  if (!S.gEdges.has(key)) S.gEdges.set(key, { a: aId, b: bId, similarity });
}

// ── Count edges touching a node ──
export function countNodeEdges(id) {
  let count = 0;
  for (const edge of S.gEdges.values()) {
    if (edge.a === id || edge.b === id) count++;
  }
  return count;
}

// ── Count how many of a node's neighbors are in the graph ──
function countNeighborsInGraph(node) {
  if (!node.neighborIds) return countNodeEdges(node.id); // fallback to edge count
  let count = 0;
  for (const nid of node.neighborIds) {
    if (S.gNodes.has(nid)) count++;
  }
  return count;
}

// ── Get node visual state ──
// Returns 'solid' (unexpanded/unknown), 'partial' (some neighbors hidden), 'hollow' (all visible)
export function getNodeState(node) {
  if (node.totalNeighbors === null || node.totalNeighbors === undefined) return 'solid';
  const inGraph = countNeighborsInGraph(node);
  if (inGraph >= node.totalNeighbors) return 'hollow';
  if (node.expanded || inGraph > 0) return 'partial';
  return 'solid';
}

// ── Get remaining unknown neighbors ──
export function getRemainingNeighbors(node) {
  if (node.totalNeighbors === null || node.totalNeighbors === undefined) return null;
  return Math.max(0, node.totalNeighbors - countNeighborsInGraph(node));
}

// ── Virtual edges for focused node ──
let virtualEdges = []; // { targetId, similarity } — edges to existing graph nodes
let focusedNodeId = null;

export function getFocusedNodeId() { return focusedNodeId; }

export async function setFocusedNode(id) {
  focusedNodeId = id;
  virtualEdges = [];
  if (!id) { drawGraph(); return; }

  const node = S.gNodes.get(id);
  if (!node) return;

  try {
    const res = await apiFetch(`/api/neighbors/${id}?limit=200&threshold=${GRAPH_THRESHOLD}`);
    if (!res.ok) return;
    const { neighbors, total } = await res.json();
    if (focusedNodeId !== id) return; // focus changed while fetching

    node.totalNeighbors = total || 0;

    const existing = (neighbors || []).filter(nb => nb.id !== id && S.gNodes.has(nb.id));

    // Semi-transparent edges to existing graph nodes (only while focused)
    virtualEdges = existing
      .filter(nb => {
        const key = [id, nb.id].sort().join('|');
        return !S.gEdges.has(key);
      })
      .map(nb => ({ targetId: nb.id, similarity: nb.similarity }));

    drawGraph();
  } catch {}
}

export function clearFocusedNode() {
  focusedNodeId = null;
  virtualEdges = [];
  drawGraph();
}

// ── Fetch neighbor IDs and total count for a node ──
async function fetchTotalNeighbors(id) {
  try {
    const res = await apiFetch(`/api/neighbors/${id}?limit=200&threshold=${GRAPH_THRESHOLD}`);
    if (!res.ok) return;
    const { neighbors, total } = await res.json();
    const node = S.gNodes.get(id);
    if (node) {
      node.totalNeighbors = total || 0;
      node.neighborIds = (neighbors || []).filter(nb => nb.id !== id).map(nb => nb.id);
      drawGraph();
    }
  } catch {}
}

function zoomToNode(node, targetScale) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const screenCx = W / 2, screenCy = H / 2;
  const targetVpX = screenCx - node.x * targetScale;
  const targetVpY = screenCy - node.y * targetScale;
  return { targetVpX, targetVpY, targetScale };
}

export async function expandNode(id) {
  const node = S.gNodes.get(id);
  if (!node || node.expanded) return;
  node.expanded = true;
  startLoadingSpinner(id);

  try {
    const res = await apiFetch(`/api/neighbors/${id}?limit=${EXPAND_LIMIT}&threshold=${GRAPH_THRESHOLD}`);
    if (!res.ok) return;
    const { neighbors, total } = await res.json();

    node.totalNeighbors = total || 0;
    node.neighborIds = (neighbors || []).filter(nb => nb.id !== id).map(nb => nb.id);

    const newNeighbors = (neighbors || []).filter(nb => nb.id !== id && !S.gNodes.has(nb.id));
    if (!newNeighbors.length) return;

    let hasIncoming = false, outAngle = 0;
    for (const edge of S.gEdges.values()) {
      if (edge.a === id || edge.b === id) {
        const parentId = edge.a === id ? edge.b : edge.a;
        const parent = S.gNodes.get(parentId);
        if (parent) { outAngle = Math.atan2(node.y - parent.y, node.x - parent.x); hasIncoming = true; }
        break;
      }
    }

    const zoomTarget = Math.max(S.vpScale * 1.5, 1.5);
    const zoom = zoomToNode(node, zoomTarget);
    await animateViewport(zoom.targetVpX, zoom.targetVpY, zoom.targetScale, 300);

    const count = newNeighbors.length;
    const arcSpread = hasIncoming
      ? Math.min(Math.PI * 1.0, Math.PI * 0.3 * count)
      : Math.PI * 2 * (1 - 1 / Math.max(count, 2));
    const ringRadius = 5;
    for (let i = 0; i < count; i++) {
      const nb = newNeighbors[i];
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
      const angle = outAngle + t * arcSpread;
      S.gNodes.set(nb.id, {
        id: nb.id, data: nb,
        x: node.x + Math.cos(angle) * ringRadius,
        y: node.y + Math.sin(angle) * ringRadius,
        vx: 0, vy: 0, expanded: false, totalNeighbors: null,
      });
      addGraphEdge(id, nb.id, nb.similarity);
      // Fire off total neighbor count for each new node
      fetchTotalNeighbors(nb.id);
    }

    if (S.gNodes.size > 2) document.getElementById('btn-reset-graph').style.display = 'block';
    startSim();
  } finally {
    stopLoadingSpinner();
  }
}

function animateViewport(tx, ty, ts, duration) {
  return new Promise(resolve => {
    const sx = S.vpX, sy = S.vpY, ss = S.vpScale;
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      S.setVpX(sx + (tx - sx) * ease);
      S.setVpY(sy + (ty - sy) * ease);
      S.setVpScale(ss + (ts - ss) * ease);
      drawGraph();
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

// ── Physics simulation ──
const NODE_RADIUS = 30;
const EDGE_REST = 70;
let animId = null;
export let dragNode = null;
export function setDragNode(v) { dragNode = v; }

function simStep() {
  const nodes = [...S.gNodes.values()];
  if (nodes.length < 2) return 0;

  for (const n of nodes) { n.fx = 0; n.fy = 0; }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
      if (d < NODE_RADIUS) {
        const push = (NODE_RADIUS - d) * 0.08;
        const dd = d || 0.5;
        a.fx += (dx / dd) * push; a.fy += (dy / dd) * push;
        b.fx -= (dx / dd) * push; b.fy -= (dy / dd) * push;
      }
    }
  }

  for (const edge of S.gEdges.values()) {
    const a = S.gNodes.get(edge.a), b = S.gNodes.get(edge.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const f = (d - EDGE_REST) * 0.012;
    a.fx += (dx / d) * f; a.fy += (dy / d) * f;
    b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
  }

  let totalMove = 0;
  for (const n of nodes) {
    if (n === dragNode) continue;
    n.vx = (n.vx || 0) * 0.85 + n.fx;
    n.vy = (n.vy || 0) * 0.85 + n.fy;
    const v = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (v > 1.0) { n.vx *= 1.0 / v; n.vy *= 1.0 / v; }
    n.x += n.vx; n.y += n.vy;
    totalMove += Math.abs(n.vx) + Math.abs(n.vy);
  }
  return totalMove;
}

let simFrames = 0;
export function startSim() {
  if (animId) cancelAnimationFrame(animId);
  simFrames = 0;
  function loop() {
    const movement = simStep();
    drawGraph();
    simFrames++;
    if (movement > 0.05 && simFrames < 1000) animId = requestAnimationFrame(loop);
    else animId = null;
  }
  animId = requestAnimationFrame(loop);
}

// ── Selection UI ──
export function updateSelectionUI() {
  const el = document.getElementById('selection-actions');
  const count = S.selectedNodes.size;
  if (count > 0) {
    el.classList.add('visible');
    document.getElementById('selection-count').textContent = `${count} selected`;
  } else {
    el.classList.remove('visible');
  }
}

// ── Canvas rendering ──
export function drawGraph() {
  if (!setupCanvas()) return;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  hitTargets = [];

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f0f13';
  ctx.fillRect(0, 0, W, H);

  if (!S.gNodes.size) {
    ctx.fillStyle = '#2a2a3a';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Select a thought to explore its neighborhood', W / 2, H / 2);
    return;
  }

  // Edges
  for (const { a: aId, b: bId, similarity } of S.gEdges.values()) {
    const a = S.gNodes.get(aId), b = S.gNodes.get(bId);
    if (!a || !b) continue;
    const [ax, ay] = S.w2s(a.x, a.y);
    const [bx, by] = S.w2s(b.x, b.y);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.strokeStyle = `rgba(100,100,180,${0.2 + similarity * 0.55})`;
    ctx.lineWidth = 0.8 + similarity * 2.2;
    ctx.stroke();
    const edgeScreenLen = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
    if (edgeScreenLen > 100) {
      const pct = Math.round(similarity * 100) + '%';
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const alpha = Math.min(1, (edgeScreenLen - 100) / 80);
      ctx.fillStyle = `rgba(160,160,220,${alpha})`;
      ctx.fillText(pct, mx, my);
    }
  }

  // Nodes
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const node of S.gNodes.values()) {
    const { x, y, data } = node;
    const type = data.metadata?.type || '';
    const isLoading = node.id === loadingNodeId;
    const [sx, sy] = S.w2s(x, y);
    const r = 8;
    const state = getNodeState(node);
    const color = typeColor(type);

    // Selection highlight
    if (S.selectedNodes.has(node.id)) {
      ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#6090ff'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(96,144,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    }

    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
    if (state === 'hollow') {
      // Fully expanded — hollow circle
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    } else if (state === 'partial') {
      // Partially expanded — half-filled ring
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      // Inner dot to indicate partial
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    } else {
      // Solid — unexpanded or unknown
      ctx.fillStyle = color; ctx.fill();
    }

    if (isLoading) {
      ctx.beginPath(); ctx.arc(sx, sy, r + 6, loadingAngle, loadingAngle + Math.PI * 1.2);
      ctx.strokeStyle = 'rgba(96,144,255,0.9)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
    }

    // Labels
    let minScreenDist = Infinity;
    for (const other of S.gNodes.values()) {
      if (other.id === node.id) continue;
      const [ox, oy] = S.w2s(other.x, other.y);
      const sd = Math.sqrt((sx - ox) ** 2 + (sy - oy) ** 2);
      if (sd < minScreenDist) minScreenDist = sd;
    }
    if (minScreenDist > 80) {
      const labelText = (data.title || data.content || '').replace(/\s+/g, ' ');
      const maxChars = Math.round(Math.min(200, (minScreenDist - 80) * 1.5));
      if (maxChars > 10) {
        const text = labelText.length > maxChars ? labelText.slice(0, maxChars) + '\u2026' : labelText;
        const lineW = Math.min(220, minScreenDist * 0.6);
        ctx.font = '12px system-ui'; ctx.textBaseline = 'top';
        const alpha = Math.min(0.8, (minScreenDist - 80) / 120);
        ctx.fillStyle = `rgba(160,160,200,${alpha})`;
        const words = text.split(' ');
        let line = '', lineY = sy + 14, lineH = 15;
        for (const word of words) {
          const test = line ? line + ' ' + word : word;
          if (ctx.measureText(test).width > lineW && line) {
            ctx.fillText(line, sx, lineY); lineY += lineH; line = word;
          } else { line = test; }
        }
        if (line) ctx.fillText(line, sx, lineY);
        ctx.textBaseline = 'middle';
      }
    }

    if (isLoading) {
      const t = Date.now() / 300;
      ctx.beginPath(); ctx.arc(sx, sy, 15, t, t + Math.PI * 1.4);
      ctx.strokeStyle = 'rgba(80,80,160,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    hitTargets.push({ sx, sy, r: 14, node });
  }

  // Virtual edges to existing graph nodes (shown while node card is open)
  if (focusedNodeId && virtualEdges.length) {
    const parent = S.gNodes.get(focusedNodeId);
    if (parent) {
      const [psx, psy] = S.w2s(parent.x, parent.y);
      for (const ve of virtualEdges) {
        const target = S.gNodes.get(ve.targetId);
        if (!target) continue;
        const [tsx, tsy] = S.w2s(target.x, target.y);
        ctx.beginPath(); ctx.moveTo(psx, psy); ctx.lineTo(tsx, tsy);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = `rgba(100,100,180,${0.15 + ve.similarity * 0.25})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        // Percentage label on virtual edge
        const edgeLen = Math.sqrt((psx - tsx) ** 2 + (psy - tsy) ** 2);
        if (edgeLen > 60) {
          const pct = Math.round(ve.similarity * 100) + '%';
          const mx = (psx + tsx) / 2, my = (psy + tsy) / 2;
          ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(160,160,220,0.5)';
          ctx.fillText(pct, mx, my);
        }
      }
    }
  }
}

// ── Hit testing ──
export function hitNode(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  for (const t of hitTargets) {
    if (Math.hypot(mx - t.sx, my - t.sy) <= t.r) return t.node;
  }
  return null;
}

// ── Show semantic links to existing graph nodes ──
// Show all semantic links = focus the node (shows virtual edges + ghosts)
export async function showAllLinks(id) {
  await setFocusedNode(id);
}

// ── Expand all remaining neighbors ──
export async function expandAllNeighbors(id) {
  const node = S.gNodes.get(id);
  if (!node) return;
  startLoadingSpinner(id);
  try {
    const res = await apiFetch(`/api/neighbors/${id}?limit=200&threshold=${GRAPH_THRESHOLD}`);
    if (!res.ok) return;
    const { neighbors, total } = await res.json();
    const fresh = (neighbors || []).filter(nb => nb.id !== id && !S.gNodes.has(nb.id));

    if (fresh.length) {
      const ringRadius = 5;
      for (let i = 0; i < fresh.length; i++) {
        const nb = fresh[i];
        const angle = (2 * Math.PI * i) / fresh.length;
        S.gNodes.set(nb.id, {
          id: nb.id, data: nb,
          x: node.x + Math.cos(angle) * ringRadius,
          y: node.y + Math.sin(angle) * ringRadius,
          vx: 0, vy: 0, expanded: false, totalNeighbors: null,
        });
        addGraphEdge(id, nb.id, nb.similarity);
        fetchTotalNeighbors(nb.id);
      }
    }

    node.expanded = true;
    node.totalNeighbors = total || 0;
    if (S.gNodes.size > 2) document.getElementById('btn-reset-graph').style.display = 'block';
    startSim();
    drawGraph();
  } finally {
    stopLoadingSpinner();
  }
}

export { canvas };
