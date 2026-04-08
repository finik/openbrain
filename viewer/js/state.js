// ── Shared mutable state ──

export let selectedId = null;
export let allThoughts = [];

export let listMode = 'browse';
export let listPage = 0;
export let listTotal = 0;
export let listLoading = false;
export let listSortAsc = false;

export let searchQuery = '';
export let searchLimit = 50;
export let typeFilter = '';

export let graphTool = 'pan'; // 'pan' or 'select'
export const selectedNodes = new Set();

// Graph data
export const gNodes = new Map();
export const gEdges = new Map();

// Viewport
export let vpX = 0, vpY = 0, vpScale = 1;

// Setters for primitives
export function setSelectedId(v) { selectedId = v; }
export function setAllThoughts(v) { allThoughts = v; }
export function setListMode(v) { listMode = v; }
export function setListPage(v) { listPage = v; }
export function setListTotal(v) { listTotal = v; }
export function setListLoading(v) { listLoading = v; }
export function setListSortAsc(v) { listSortAsc = v; }
export function setSearchQuery(v) { searchQuery = v; }
export function setSearchLimit(v) { searchLimit = v; }
export function setTypeFilter(v) { typeFilter = v; }
export function setGraphTool(v) { graphTool = v; }
export function setVpX(v) { vpX = v; }
export function setVpY(v) { vpY = v; }
export function setVpScale(v) { vpScale = v; }

// Viewport transforms
export const w2s = (wx, wy) => [vpX + wx * vpScale, vpY + wy * vpScale];
export const s2w = (sx, sy) => [(sx - vpX) / vpScale, (sy - vpY) / vpScale];
