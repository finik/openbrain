# Open Brain

A self-hosted persistent memory system for AI assistants. Captures thoughts, generates embeddings, and retrieves them via hybrid semantic + full-text search. Built on Supabase with pgvector.

**Viewer:** [openbrain.finik.net](https://openbrain.finik.net/)
**Demo:** [openbrain.finik.net/?demo](https://openbrain.finik.net/?demo)

---

## What it does

- **Capture** — save thoughts with auto-generated titles, embeddings, and metadata extraction
- **Search** — hybrid retrieval combining pgvector cosine similarity with PostgreSQL full-text search, merged via Reciprocal Rank Fusion
- **Progressive disclosure** — compact mode returns titles only; fetch full content on demand to save tokens
- **MCP server** — integrates with Claude Code, Claude Desktop, Cursor, or any MCP-compatible client
- **REST API** — browser-accessible endpoints for the viewer and external integrations
- **Visual explorer** — force-directed graph of semantically similar thoughts, inline editing, demo mode with 170 famous quotes

---

## Origins and credits

This project builds on two open-source projects:

### [Open Brain (OB1)](https://github.com/NateBJones-Projects/OB1) by Nate Jones

The original Open Brain concept — persistent AI memory infrastructure using Supabase + pgvector. OB1 provides the foundational architecture: a PostgreSQL database with vector embeddings, an MCP server for AI clients, and the "capture → embed → retrieve" loop.

**Where we diverge from OB1:**
- **Custom MCP server** — rewrote the Edge Function with hybrid search (FTS + vector + RRF), auto-generated titles via GPT-4o-mini, JSONB metadata extraction, and simplified two-type system (task/note)
- **Embeddings via OpenRouter** — uses `text-embedding-3-small` through OpenRouter instead of direct OpenAI, allowing flexible model routing
- **Custom auth** — `x-brain-key` header instead of Supabase JWT, deployed with `--no-verify-jwt`
- **REST API layer** — added `/api/thoughts`, `/api/search`, `/api/neighbors/:id` endpoints for the web viewer
- **Visual explorer** — force-directed graph viewer with demo mode (not part of OB1)
- **Dreaming** — nightly memory consolidation process that deduplicates, merges, and generates insights
- **Transcript processor** — extracts facts from Claude Code session logs into Open Brain

If you're starting fresh, follow [OB1's setup guide](https://github.com/NateBJones-Projects/OB1) for the Supabase project creation and initial database schema, then deploy this project's Edge Function on top.

### [claude-mem](https://github.com/thedotmack/claude-mem) by thedotmack

Inspired the progressive disclosure retrieval pattern (compact index → timeline context → full details), hybrid search combining vector and keyword approaches, and lifecycle hook-based capture. The three-layer search pattern in our `search_thoughts(compact=true)` → `get_thought(id)` flow comes directly from claude-mem's token-efficient retrieval design.

---

## Architecture

```
Supabase
├── PostgreSQL + pgvector
│     thoughts table: id, title, content, embedding(1536), metadata(JSONB),
│                     search_vector(tsvector), created_at, updated_at
│     Indexes: HNSW (embedding), GIN (search_vector), GIN (metadata)
│
└── Edge Function: open-brain-mcp
      ├── MCP server (capture, search, list, get, update, delete, stats)
      ├── REST API (/api/thoughts, /api/search, /api/neighbors/:id)
      ├── Embeddings via OpenRouter (text-embedding-3-small)
      └── Metadata extraction via GPT-4o-mini

Optional automation
├── bin/process-transcripts.py  — extracts facts from Claude Code sessions
├── bin/openbrain-startup.sh    — fetches tasks for session startup display
├── prompts/dreams-prompt.md    — nightly memory consolidation
└── viewer/                     — web-based visual explorer
```

### Database schema

The `thoughts` table stores everything:

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Primary key |
| `title` | TEXT | Auto-generated ~10 word summary |
| `content` | TEXT | Full thought content |
| `embedding` | vector(1536) | text-embedding-3-small via OpenRouter |
| `metadata` | JSONB | type, topics, people, action_items, dates |
| `search_vector` | tsvector | Full-text search index |
| `created_at` | TIMESTAMPTZ | Creation time |
| `updated_at` | TIMESTAMPTZ | Last modification |

**Indexes**: HNSW on embedding (cosine), GIN on search_vector, GIN on metadata, B-tree on timestamps.

### Search

Hybrid search runs FTS and vector queries in parallel, then merges results via Reciprocal Rank Fusion (k=60). This produces better results than either approach alone — FTS catches exact keyword matches that vector search misses, while vector search finds semantically related thoughts that don't share keywords.

### Metadata extraction

On capture, GPT-4o-mini extracts structured metadata from the thought content: a title, topic tags, people mentioned, action items, dates, and type classification (task vs note). This enables filtered search and the viewer's type color coding.

---

## Quick start

### 1. Set up Supabase

Follow [OB1's setup guide](https://github.com/NateBJones-Projects/OB1) to create a Supabase project with pgvector enabled. Then apply our migration:

```bash
supabase db push
```

### 2. Configure environment

Set these in your Supabase project's Edge Function secrets:

- `SUPABASE_URL` — your project URL (auto-set by Supabase)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (auto-set by Supabase)
- `OPENROUTER_API_KEY` — for embeddings and metadata extraction
- `MCP_ACCESS_KEY` — your chosen secret for `x-brain-key` auth

### 3. Deploy the Edge Function

```bash
cd supabase
supabase functions deploy open-brain-mcp --no-verify-jwt
```

The `--no-verify-jwt` flag is required — the function uses custom `x-brain-key` auth instead of Supabase JWTs.

### 4. Register as MCP server

In Claude Code or Claude Desktop config:

```json
{
  "mcpServers": {
    "open-brain-mcp": {
      "url": "https://<your-project>.supabase.co/functions/v1/open-brain-mcp",
      "headers": { "x-brain-key": "<your-key>" }
    }
  }
}
```

---

## MCP Tools

| Tool | Description |
|---|---|
| `capture_thought(content)` | Save a thought — auto-generates title, embedding, and metadata |
| `search_thoughts(query, limit, threshold, compact, type)` | Hybrid FTS + vector search; `compact=true` for titles only |
| `get_thought(id)` | Fetch full content by ID (for progressive disclosure) |
| `list_thoughts(limit, type, days, order, compact)` | Deterministic listing with filters |
| `update_thought(id, content)` | Update content, regenerates title + embedding + metadata |
| `delete_thought(id)` | Permanent delete |
| `thought_stats()` | Totals by type, topic, and people |
| `memory_workflow` | Instructions for retrieval/capture patterns |

---

## Viewer

The visual explorer is a static web app served via GitHub Pages.

**Live:** [openbrain.finik.net](https://openbrain.finik.net/)
**Demo:** [openbrain.finik.net/?demo](https://openbrain.finik.net/?demo) — 170 famous quotes with real semantic embeddings

### Features

- Semantic search with infinite scroll
- Force-directed neighborhood graph with spring physics
- Click to expand, hover for details, right-click for context menu
- Inline editing and deletion
- Mobile support: touch pan, pinch-to-zoom, long-press context menu
- Rectangle selection for bulk merge/review/delete
- Demo mode with precomputed embeddings (no backend needed)

### Connect your own instance

Visit the live site, go to Settings, and enter your Supabase Function URL and `x-brain-key`. Credentials stay in your browser's `localStorage` — the viewer is fully static.

### Self-hosted

```bash
cd viewer
python3 -m http.server 8765
```

---

## Automation scripts

These scripts automate memory maintenance. They work with any Claude Code setup — just schedule them via launchd, cron, or similar.

### Transcript processor (`bin/process-transcripts.py`)

Scans Claude Code session transcripts (`~/.claude/projects/`), extracts notable facts and decisions, and captures them to Open Brain. Run on a schedule (e.g., every 30 minutes).

### Dreaming (`prompts/dreams-prompt.md`)

Nightly memory consolidation — run via `claude -p prompts/dreams-prompt.md`:
1. Processes new and old thoughts — deduplicates, merges clusters, deletes noise
2. Generates insights with urgency levels (high/medium/low)
3. Cleans stale tasks
4. Updates a short-term memory file for quick context loading

### Startup hook (`bin/openbrain-startup.sh`)

Fetches open tasks and recent thoughts via REST API, suitable for displaying at Claude Code session start.

### Scheduling

launchd templates are provided in `launchd/` for macOS. Adjust paths and load via `launchctl`:

```bash
# Example: load dreaming schedule
launchctl load ~/Library/LaunchAgents/com.yourname.claude-dreaming.plist
```

---

## Project structure

```
supabase/
  functions/open-brain-mcp/   Supabase Edge Function (MCP + REST)
  migrations/                 Database migrations
  config.toml                 Local Supabase dev config
viewer/
  index.html                  Viewer HTML
  styles.css                  Viewer styles
  js/                         ES modules (graph, interaction, search, etc.)
  js/mock-data.json           170 quotes with precomputed embeddings
  scripts/                    Mock data generator
  server.py                   Local server with dreaming log API
bin/
  process-transcripts.py      Claude Code transcript → Open Brain
  openbrain-startup.sh        Session startup task display
  count-tokens.py             Token usage logging
prompts/
  dreams-prompt.md            Nightly memory consolidation prompt
launchd/
  claude-dreaming.plist.template      Dreaming schedule
  claude-transcripts.plist.template   Transcript processor schedule
scripts/
  backfill-titles.mjs         Backfill missing titles
```

---

## License

MIT
