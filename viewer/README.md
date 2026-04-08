# Open Brain Viewer

A visual explorer for [Open Brain MCP](https://github.com/finik/open-brain-mcp) — a long-term memory backend built on Supabase with pgvector embeddings.

**Live:** [openbrain.finik.net](https://openbrain.finik.net/)
**Demo:** [openbrain.finik.net/?demo](https://openbrain.finik.net/?demo)

## Features

- **Semantic search** — type a query and get results ranked by vector similarity, with infinite scroll
- **Force-directed graph** — select a thought to see its neighborhood; click nodes to expand; the graph rebalances automatically using spring physics
- **Inline editing** — hover or click a graph node to view details, edit content, or delete thoughts
- **Similarity scores** — zoom into the graph to see cosine similarity percentages on edges
- **Type color coding** — thoughts are colored by type (task/note)
- **Dreaming log viewer** — browse nightly dreaming runs when served locally with `server.py`
- **Demo mode** — try the full UI without credentials using a built-in dataset of 170 famous quotes with real semantic embeddings

## Quick start

### Try the demo

Visit [openbrain.finik.net/?demo](https://openbrain.finik.net/?demo) — no setup needed. Explore 170 famous quotes with real cosine similarity from `all-MiniLM-L6-v2` embeddings.

### Connect your own Open Brain

Visit [openbrain.finik.net](https://openbrain.finik.net/) and enter your credentials on the Settings tab:

- **Supabase Function URL** — your Open Brain edge function endpoint
- **Access Key** — your `x-brain-key` secret

Credentials are stored in your browser's `localStorage` and never leave your machine. The viewer is a static site — all API calls go directly from your browser to your Supabase instance.

### Self-hosted

No build step. Serve the directory with any static server:

```bash
cd open-brain-viewer
python3 -m http.server 8765
```

Open `http://localhost:8765/`. Add `?demo` for demo mode, or configure credentials on the Settings tab.

For local use with dreaming log access:

```bash
python3 server.py --port 8765 --logs-dir ~/.jarvis/logs
```

This enables the Dreaming tab which displays nightly dreaming run logs.

### macOS launchd (always-on)

A plist template is included for running the viewer as a persistent local service:

```bash
cp openbrain-viewer.plist.template ~/Library/LaunchAgents/com.open-brain-viewer.plist
# Edit paths in the plist if needed
launchctl load ~/Library/LaunchAgents/com.open-brain-viewer.plist
```

## Usage

| Action | Effect |
|---|---|
| Type in search bar | Semantic search (live) or text search (demo) |
| Clear search | Browse all thoughts (newest first) |
| Click sort arrow | Toggle newest/oldest sort order |
| Scroll to bottom | Infinite scroll loads more |
| Click a thought in list | Centers graph on that thought and loads neighbors |
| Click a graph node | Expands that node's neighbors |
| Hover over list row or node | Shows detail card |
| Right-click a graph node | Context menu: show all semantic links |
| Select tool + drag | Rectangle-select nodes for bulk merge/review/delete |
| Scroll wheel on graph | Zoom toward cursor |
| Drag on graph | Pan |
| Settings tab | Configure Supabase URL and key |

## Project structure

```
index.html          HTML structure
styles.css          All styles
js/
  app.js            Bootstrap / init
  config.js         LocalStorage config, constants, demo detection
  api.js            Live Supabase API + mock API layer
  state.js          Shared mutable state
  graph.js          Graph model, physics simulation, canvas rendering
  interaction.js    Pan, zoom, drag, rectangle select, context menu
  node-card.js      Hover/pinned detail card, edit, delete
  list.js           Thought list, search, infinite scroll
  dreaming.js       Dreaming log tab
  settings.js       Settings tab
  tabs.js           Tab switching
  utils.js          Utilities
  mock-data.json    170 quotes with precomputed embeddings
scripts/
  generate-mock-data.py   Regenerate mock data (requires sentence-transformers)
server.py           Local server with dreaming log API
```

## Requirements

An [Open Brain MCP](https://github.com/finik/open-brain-mcp) instance deployed to Supabase with the REST API endpoints enabled (`/api/thoughts`, `/api/search`, `/api/neighbors/:id`). Or just use `?demo` to explore with sample data.
