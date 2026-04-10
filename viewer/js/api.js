import { BRAIN_URL, BRAIN_KEY, isDemoMode } from './config.js';

let mockData = null;

async function loadMockData() {
  if (mockData) return mockData;
  const res = await fetch('./js/mock-data.json');
  mockData = await res.json();
  return mockData;
}

// ── Live API ──
function liveFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'x-brain-key': BRAIN_KEY } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch(BRAIN_URL + path, opts);
}

// ── Mock API ──
async function mockFetch(path, method = 'GET', body = null) {
  const data = await loadMockData();
  const url = new URL(path, 'http://localhost');
  const params = url.searchParams;
  const pathname = url.pathname;

  // GET /api/thoughts?limit=N&page=N&order=asc|desc&type=X
  if (pathname === '/api/thoughts' && method === 'GET') {
    let thoughts = [...data.thoughts];
    const type = params.get('type');
    if (type) thoughts = thoughts.filter(t => (t.metadata?.type || '') === type);
    const order = params.get('order') || 'desc';
    thoughts.sort((a, b) => order === 'asc'
      ? a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at));
    const limit = parseInt(params.get('limit') || '100');
    const page = parseInt(params.get('page') || '0');
    const start = page * limit;
    return mockResponse({ thoughts: thoughts.slice(start, start + limit), total: thoughts.length });
  }

  // GET /api/search?q=X&limit=N
  if (pathname === '/api/search' && method === 'GET') {
    const q = (params.get('q') || '').toLowerCase();
    const limit = parseInt(params.get('limit') || '50');
    const results = data.thoughts
      .filter(t => t.content.toLowerCase().includes(q) || (t.title || '').toLowerCase().includes(q))
      .slice(0, limit);
    return mockResponse({ results });
  }

  // GET /api/neighbors/:id?limit=N&threshold=X
  const neighborMatch = pathname.match(/^\/api\/neighbors\/(.+)$/);
  if (neighborMatch && method === 'GET') {
    const id = neighborMatch[1];
    const limit = parseInt(params.get('limit') || '8');
    const threshold = parseFloat(params.get('threshold') || '0');
    const allNeighbors = (data.neighbors[id] || []).filter(n => n.similarity >= threshold);
    const neighborList = allNeighbors.slice(0, limit);
    // Enrich with full thought data
    const thoughtMap = new Map(data.thoughts.map(t => [t.id, t]));
    const neighbors = neighborList
      .map(n => ({ ...thoughtMap.get(n.id), similarity: n.similarity }))
      .filter(n => n.id);
    const total = allNeighbors.length;
    return mockResponse({ neighbors, total });
  }

  // GET /api/thoughts/:id
  const thoughtMatch = pathname.match(/^\/api\/thoughts\/(.+)$/);
  if (thoughtMatch && method === 'GET') {
    const id = thoughtMatch[1];
    const t = data.thoughts.find(t => t.id === id);
    return t ? mockResponse(t) : mockResponse({ error: 'Not found' }, 404);
  }

  // DELETE /api/thoughts/:id — remove from in-memory mock
  if (thoughtMatch && method === 'DELETE') {
    const id = thoughtMatch[1];
    data.thoughts = data.thoughts.filter(t => t.id !== id);
    delete data.neighbors[id];
    return mockResponse({ ok: true });
  }

  // PATCH /api/thoughts/:id — update in-memory mock
  if (thoughtMatch && method === 'PATCH') {
    const id = thoughtMatch[1];
    const t = data.thoughts.find(t => t.id === id);
    if (!t) return mockResponse({ error: 'Not found' }, 404);
    if (body?.content) t.content = body.content;
    if (body?.metadata) t.metadata = { ...t.metadata, ...body.metadata };
    return mockResponse(t);
  }

  return mockResponse({ error: 'Not found' }, 404);
}

function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

// ── Public API ──
export function apiFetch(path, method = 'GET', body = null) {
  if (isDemoMode()) return mockFetch(path, method, body);
  return liveFetch(path, method, body);
}
