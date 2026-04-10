// Resizable pane splits with localStorage persistence
const STORAGE_KEY = 'ob-pane-sizes';

function loadSizes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveSizes(sizes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
}

function initResize(handleId, beforeEl, afterEl, direction, sizeKey, defaultPct) {
  const handle = document.getElementById(handleId);
  if (!handle || !beforeEl || !afterEl) return;

  const sizes = loadSizes();
  const saved = sizes[sizeKey];
  if (saved != null) applySize(saved);
  else applySize(defaultPct);

  let startPos, startSize;

  function applySize(pct) {
    pct = Math.max(15, Math.min(85, pct));
    if (direction === 'horizontal') {
      beforeEl.style.flex = `0 0 ${pct}%`;
      afterEl.style.flex = '1';
    } else {
      // vertical split: beforeEl gets flex-basis as percentage of parent height
      beforeEl.style.flex = `0 0 ${pct}%`;
      afterEl.style.flex = '1';
    }
  }

  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    handle.classList.add('active');
    const parent = handle.parentElement;
    const parentRect = parent.getBoundingClientRect();
    if (direction === 'horizontal') {
      startPos = e.clientX;
      startSize = beforeEl.getBoundingClientRect().width / parentRect.width * 100;
    } else {
      startPos = e.clientY;
      startSize = beforeEl.getBoundingClientRect().height / parentRect.height * 100;
    }

    function onMove(e) {
      const parent2 = handle.parentElement;
      const parentRect2 = parent2.getBoundingClientRect();
      let delta;
      if (direction === 'horizontal') {
        delta = (e.clientX - startPos) / parentRect2.width * 100;
      } else {
        delta = (e.clientY - startPos) / parentRect2.height * 100;
      }
      applySize(startSize + delta);
    }

    function onUp(e) {
      handle.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // Save final size
      const parent2 = handle.parentElement;
      const parentRect2 = parent2.getBoundingClientRect();
      let finalPct;
      if (direction === 'horizontal') {
        finalPct = beforeEl.getBoundingClientRect().width / parentRect2.width * 100;
      } else {
        finalPct = beforeEl.getBoundingClientRect().height / parentRect2.height * 100;
      }
      const s = loadSizes();
      s[sizeKey] = Math.round(finalPct * 10) / 10;
      saveSizes(s);
      // Trigger canvas resize
      window.dispatchEvent(new Event('pane-resize'));
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

export function setupResizablePanes() {
  const thoughtsView = document.getElementById('thoughts-view');
  const listPanel = thoughtsView?.querySelector('.list-panel');
  const rightPanel = thoughtsView?.querySelector('.right-panel');

  // Left/Right: list panel vs right panel
  if (listPanel && rightPanel) {
    initResize('resize-list-graph', listPanel, rightPanel, 'horizontal', 'list-width', 44);
  }

  // Top/Bottom: graph panel vs node card
  const graphPanel = document.querySelector('.graph-panel');
  const nodeCard = document.getElementById('node-card');
  if (graphPanel && nodeCard) {
    initResize('resize-graph-card', graphPanel, nodeCard, 'vertical', 'graph-height', 65);
  }
}
