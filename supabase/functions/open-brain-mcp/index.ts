import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getEmbedding(text: string): Promise<number[]> {
  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

async function extractMetadata(text: string): Promise<{ title: string; metadata: Record<string, unknown> }> {
  const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract metadata from the user's captured thought. Return JSON with:
- "title": a concise ~10 word title summarizing the thought
- "people": array of people mentioned (empty if none)
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one)
- "type": one of "task", "note". Use "task" only for actionable items requiring follow-up; everything else is "note"
Only extract what's explicitly there.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  const d = await r.json();
  try {
    const parsed = JSON.parse(d.choices[0].message.content);
    const title = parsed.title || text.slice(0, 80);
    delete parsed.title;
    return { title, metadata: parsed };
  } catch {
    return { title: text.slice(0, 80), metadata: { topics: ["uncategorized"], type: "note" } };
  }
}

// --- MCP Server Setup ---

const server = new McpServer({
  name: "open-brain",
  version: "1.0.0",
});

// Hybrid search: run FTS + vector in parallel, merge with Reciprocal Rank Fusion
async function hybridSearch(
  query: string,
  limit: number,
  threshold: number,
  filter: Record<string, unknown>
): Promise<Array<{ id: string; title: string; content: string; metadata: Record<string, unknown>; similarity: number; created_at: string }>> {
  const filterJsonb = Object.keys(filter).length > 0 ? filter : {};

  const [qEmb, ftsResult] = await Promise.all([
    getEmbedding(query),
    supabase.rpc("fts_thoughts", {
      query_text: query,
      match_count: limit * 2,
      filter: filterJsonb,
    }),
  ]);

  const vectorResult = await supabase.rpc("match_thoughts", {
    query_embedding: qEmb,
    match_threshold: threshold,
    match_count: limit * 2,
    filter: filterJsonb,
  });

  const ftsData = ftsResult.data || [];
  const vectorData = vectorResult.data || [];

  // If both empty, return empty
  if (ftsData.length === 0 && vectorData.length === 0) return [];

  // If only one has results, return that
  if (ftsData.length === 0) return vectorData.slice(0, limit);
  if (vectorData.length === 0) {
    return ftsData.slice(0, limit).map((t: { id: string; title: string; content: string; metadata: Record<string, unknown>; created_at: string; rank: number }) => ({
      ...t, similarity: t.rank,
    }));
  }

  // Reciprocal Rank Fusion (k=60)
  const K = 60;
  const scores: Record<string, number> = {};
  const byId: Record<string, { id: string; title: string; content: string; metadata: Record<string, unknown>; similarity: number; created_at: string }> = {};

  ftsData.forEach((t: { id: string; title: string; content: string; metadata: Record<string, unknown>; created_at: string }, i: number) => {
    scores[t.id] = (scores[t.id] || 0) + 1 / (K + i + 1);
    byId[t.id] = { ...t, similarity: 0 };
  });

  vectorData.forEach((t: { id: string; title: string; content: string; metadata: Record<string, unknown>; similarity: number; created_at: string }, i: number) => {
    scores[t.id] = (scores[t.id] || 0) + 1 / (K + i + 1);
    byId[t.id] = t;
  });

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ ...byId[id], similarity: score }));
}

// Tool 1: Hybrid Search
server.registerTool(
  "search_thoughts",
  {
    title: "Search Thoughts",
    description:
      "Search captured thoughts using hybrid FTS + semantic search. Supports compact mode for progressive disclosure — use compact=true to get titles only, then get_thought(id) for full content.",
    inputSchema: {
      query: z.string().describe("What to search for"),
      limit: z.number().optional().default(10),
      threshold: z.number().optional().default(0.5),
      compact: z.boolean().optional().default(false).describe("If true, return only id/title/type/date (use get_thought for full content)"),
      type: z.string().optional().describe("Filter by type: task or note"),
    },
  },
  async ({ query, limit, threshold, compact, type }) => {
    try {
      const filter: Record<string, unknown> = {};
      if (type) filter.type = type;

      const data = await hybridSearch(query, limit, threshold, filter);

      if (data.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No thoughts found matching "${query}".` }],
        };
      }

      if (compact) {
        const results = data.map(
          (t, i) => {
            const m = t.metadata || {};
            return `${i + 1}. [${m.type || "note"}] ${new Date(t.created_at).toLocaleDateString()} — ${t.title || t.content.slice(0, 80)} (ID: ${t.id})`;
          }
        );
        return {
          content: [{
            type: "text" as const,
            text: `Found ${data.length} thought(s):\n\n${results.join("\n")}`,
          }],
        };
      }

      const results = data.map(
        (t, i) => {
          const m = t.metadata || {};
          const parts = [
            `--- Result ${i + 1} ---`,
            `ID: ${t.id}`,
            `Title: ${t.title || "(none)"}`,
            `Captured: ${new Date(t.created_at).toLocaleDateString()}`,
            `Type: ${m.type || "unknown"}`,
          ];
          if (Array.isArray(m.topics) && m.topics.length)
            parts.push(`Topics: ${(m.topics as string[]).join(", ")}`);
          if (Array.isArray(m.people) && m.people.length)
            parts.push(`People: ${(m.people as string[]).join(", ")}`);
          if (Array.isArray(m.action_items) && m.action_items.length)
            parts.push(`Actions: ${(m.action_items as string[]).join("; ")}`);
          parts.push(`\n${t.content}`);
          return parts.join("\n");
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${data.length} thought(s):\n\n${results.join("\n\n")}`,
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 2: List Recent
server.registerTool(
  "list_thoughts",
  {
    title: "List Recent Thoughts",
    description:
      "List recently captured thoughts with optional filters. Use compact=true for progressive disclosure — scan titles first, then get_thought(id) for full content.",
    inputSchema: {
      limit: z.number().optional().default(10),
      type: z.string().optional().describe("Filter by type: task or note"),
      topic: z.string().optional().describe("Filter by topic tag"),
      person: z.string().optional().describe("Filter by person mentioned"),
      days: z.number().optional().describe("Only thoughts from the last N days"),
      order: z.enum(["asc", "desc"]).optional().default("desc").describe("Sort order by created_at: 'asc' for oldest-first, 'desc' for newest-first (default)"),
      compact: z.boolean().optional().default(false).describe("If true, return only id/title/type/date (use get_thought for full content)"),
    },
  },
  async ({ limit, type, topic, person, days, order, compact }) => {
    try {
      let q = supabase
        .from("thoughts")
        .select("id, title, content, metadata, created_at")
        .order("created_at", { ascending: order === "asc" })
        .limit(limit);

      if (type) q = q.contains("metadata", { type });
      if (topic) q = q.contains("metadata", { topics: [topic] });
      if (person) q = q.contains("metadata", { people: [person] });
      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q;

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }

      if (!data || !data.length) {
        return { content: [{ type: "text" as const, text: "No thoughts found." }] };
      }

      if (compact) {
        const results = data.map(
          (t: { id: string; title: string; content: string; metadata: Record<string, unknown>; created_at: string }, i: number) => {
            const m = t.metadata || {};
            return `${i + 1}. [${m.type || "note"}] ${new Date(t.created_at).toLocaleDateString()} — ${t.title || t.content.slice(0, 80)} (ID: ${t.id})`;
          }
        );
        return {
          content: [{
            type: "text" as const,
            text: `${data.length} thought(s):\n\n${results.join("\n")}`,
          }],
        };
      }

      const results = data.map(
        (
          t: { id: string; title: string; content: string; metadata: Record<string, unknown>; created_at: string },
          i: number
        ) => {
          const m = t.metadata || {};
          const tags = Array.isArray(m.topics) ? (m.topics as string[]).join(", ") : "";
          return `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${m.type || "??"}${tags ? " - " + tags : ""})\n   ID: ${t.id}\n   ${t.content}`;
        }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `${data.length} recent thought(s):\n\n${results.join("\n\n")}`,
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: Stats
server.registerTool(
  "thought_stats",
  {
    title: "Thought Statistics",
    description: "Get a summary of all captured thoughts: totals, types, top topics, and people.",
    inputSchema: {},
  },
  async () => {
    try {
      const { count } = await supabase
        .from("thoughts")
        .select("*", { count: "exact", head: true });

      const { data } = await supabase
        .from("thoughts")
        .select("metadata, created_at")
        .order("created_at", { ascending: false });

      const types: Record<string, number> = {};
      const topics: Record<string, number> = {};
      const people: Record<string, number> = {};

      for (const r of data || []) {
        const m = (r.metadata || {}) as Record<string, unknown>;
        if (m.type) types[m.type as string] = (types[m.type as string] || 0) + 1;
        if (Array.isArray(m.topics))
          for (const t of m.topics) topics[t as string] = (topics[t as string] || 0) + 1;
        if (Array.isArray(m.people))
          for (const p of m.people) people[p as string] = (people[p as string] || 0) + 1;
      }

      const sort = (o: Record<string, number>): [string, number][] =>
        Object.entries(o)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

      const lines: string[] = [
        `Total thoughts: ${count}`,
        `Date range: ${
          data?.length
            ? new Date(data[data.length - 1].created_at).toLocaleDateString() +
              " → " +
              new Date(data[0].created_at).toLocaleDateString()
            : "N/A"
        }`,
        "",
        "Types:",
        ...sort(types).map(([k, v]) => `  ${k}: ${v}`),
      ];

      if (Object.keys(topics).length) {
        lines.push("", "Top topics:");
        for (const [k, v] of sort(topics)) lines.push(`  ${k}: ${v}`);
      }

      if (Object.keys(people).length) {
        lines.push("", "People mentioned:");
        for (const [k, v] of sort(people)) lines.push(`  ${k}: ${v}`);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 4: Capture Thought
server.registerTool(
  "capture_thought",
  {
    title: "Capture Thought",
    description:
      "Save a new thought to the Open Brain. Generates an embedding and extracts metadata automatically. Use this when the user wants to save something to their brain directly from any AI client — notes, insights, decisions, or migrated content from other systems.",
    inputSchema: {
      content: z.string().describe("The thought to capture — a clear, standalone statement that will make sense when retrieved later by any AI"),
    },
  },
  async ({ content }) => {
    try {
      const [embedding, extracted] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content),
      ]);

      const { error } = await supabase.from("thoughts").insert({
        content,
        title: extracted.title,
        embedding,
        metadata: { ...extracted.metadata, source: "mcp" },
      });

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to capture: ${error.message}` }],
          isError: true,
        };
      }

      const meta = extracted.metadata;
      let confirmation = `Captured as ${meta.type || "note"}: "${extracted.title}"`;
      if (Array.isArray(meta.topics) && meta.topics.length)
        confirmation += ` — ${(meta.topics as string[]).join(", ")}`;
      if (Array.isArray(meta.people) && meta.people.length)
        confirmation += ` | People: ${(meta.people as string[]).join(", ")}`;
      if (Array.isArray(meta.action_items) && meta.action_items.length)
        confirmation += ` | Actions: ${(meta.action_items as string[]).join("; ")}`;

      return {
        content: [{ type: "text" as const, text: confirmation }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 5: Delete Thought
server.registerTool(
  "delete_thought",
  {
    title: "Delete Thought",
    description:
      "Permanently delete a thought from Open Brain by its ID. Use search_thoughts or list_thoughts first to find the ID.",
    inputSchema: {
      id: z.string().describe("The UUID of the thought to delete"),
    },
  },
  async ({ id }) => {
    try {
      const { error } = await supabase.from("thoughts").delete().eq("id", id);

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to delete: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text" as const, text: `Thought ${id} deleted.` }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 6: Update Thought
server.registerTool(
  "update_thought",
  {
    title: "Update Thought",
    description:
      "Update the content of an existing thought. Regenerates the embedding and metadata automatically. Use search_thoughts or list_thoughts first to find the ID.",
    inputSchema: {
      id: z.string().describe("The UUID of the thought to update"),
      content: z.string().describe("The new content to replace the existing thought"),
    },
  },
  async ({ id, content }) => {
    try {
      const [embedding, extracted] = await Promise.all([
        getEmbedding(content),
        extractMetadata(content),
      ]);

      const { error } = await supabase
        .from("thoughts")
        .update({
          content,
          title: extracted.title,
          embedding,
          metadata: { ...extracted.metadata, source: "mcp" },
        })
        .eq("id", id);

      if (error) {
        return {
          content: [{ type: "text" as const, text: `Failed to update: ${error.message}` }],
          isError: true,
        };
      }

      const meta = extracted.metadata;
      let confirmation = `Updated ${id} as ${meta.type || "note"}: "${extracted.title}"`;
      if (Array.isArray(meta.topics) && meta.topics.length)
        confirmation += ` — ${(meta.topics as string[]).join(", ")}`;
      if (Array.isArray(meta.people) && meta.people.length)
        confirmation += ` | People: ${(meta.people as string[]).join(", ")}`;

      return {
        content: [{ type: "text" as const, text: confirmation }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 7: Get Thought (full content by ID)
server.registerTool(
  "get_thought",
  {
    title: "Get Thought",
    description:
      "Fetch the full content of a thought by ID. Use after search_thoughts(compact=true) or list_thoughts(compact=true) to retrieve details for specific results.",
    inputSchema: {
      id: z.string().describe("The UUID of the thought to retrieve"),
    },
  },
  async ({ id }) => {
    try {
      const { data, error } = await supabase
        .from("thoughts")
        .select("id, title, content, metadata, created_at, updated_at")
        .eq("id", id)
        .single();

      if (error || !data) {
        return {
          content: [{ type: "text" as const, text: `Thought not found: ${id}` }],
          isError: true,
        };
      }

      const m = data.metadata || {};
      const parts = [
        `ID: ${data.id}`,
        `Title: ${data.title || "(none)"}`,
        `Type: ${m.type || "unknown"}`,
        `Captured: ${new Date(data.created_at).toLocaleDateString()}`,
        `Updated: ${new Date(data.updated_at).toLocaleDateString()}`,
      ];
      if (Array.isArray(m.topics) && m.topics.length)
        parts.push(`Topics: ${(m.topics as string[]).join(", ")}`);
      if (Array.isArray(m.people) && m.people.length)
        parts.push(`People: ${(m.people as string[]).join(", ")}`);
      if (Array.isArray(m.action_items) && m.action_items.length)
        parts.push(`Actions: ${(m.action_items as string[]).join("; ")}`);
      parts.push(`\n${data.content}`);

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// Tool 8: Memory Workflow (instructions embedded in tool description — visible on all surfaces)
server.registerTool(
  "memory_workflow",
  {
    title: "Open Brain Memory Workflow",
    description: `READ THIS FIRST — Open Brain memory workflow.

RETRIEVAL (progressive disclosure — saves tokens):
1. search_thoughts(query, compact=true) → scan titles to find relevant thoughts
2. get_thought(id) → fetch full content only for the results you need
3. Do NOT fetch all results in full — use compact mode first

CAPTURE:
- After substantive exchanges, capture decisions, findings, preferences as standalone thoughts
- Use type "task" only for actionable items requiring follow-up; everything else is "note"
- Write each thought as a clear statement useful to a zero-context AI

DO NOT CAPTURE: time-bound reminders (use cron), calendar events, recruiter emails, routine metrics.`,
    inputSchema: {},
  },
  async () => {
    return {
      content: [{ type: "text" as const, text: "This tool contains workflow instructions in its description. No action needed." }],
    };
  }
);

// --- PCA for 2D layout (no external deps) ---

function pcaTo2D(vectors: number[][]): [number, number][] {
  const N = vectors.length;
  const D = vectors[0].length;

  // Center the data
  const mean = new Array(D).fill(0);
  for (const v of vectors) for (let j = 0; j < D; j++) mean[j] += v[j] / N;
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]));

  // Compute gram matrix G = X X^T (N x N)
  const G: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let k = i; k < N; k++) {
      let dot = 0;
      for (let j = 0; j < D; j++) dot += X[i][j] * X[k][j];
      G[i][k] = dot;
      G[k][i] = dot;
    }
  }

  // Power iteration to find top 2 eigenvectors of G
  function powerIter(mat: number[][], deflate?: number[]): number[] {
    let v = Array.from({ length: N }, () => Math.random() - 0.5);
    if (deflate) {
      // Deflate: remove component along deflate vector
      const dot = v.reduce((s, x, i) => s + x * deflate[i], 0);
      v = v.map((x, i) => x - dot * deflate[i]);
    }
    for (let iter = 0; iter < 50; iter++) {
      const next = new Array(N).fill(0);
      for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) next[i] += mat[i][k] * v[k];
      // If deflating, project out again each iteration
      if (deflate) {
        const d = next.reduce((s, x, i) => s + x * deflate[i], 0);
        for (let i = 0; i < N; i++) next[i] -= d * deflate[i];
      }
      const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-10) break;
      v = next.map((x) => x / norm);
    }
    return v;
  }

  const pc1 = powerIter(G);
  const pc2 = powerIter(G, pc1);

  // Project X onto pc1, pc2 via G eigenvectors
  // coords_i = sum_k G[i][k] * pc[k]  (kernel PCA projection)
  const coords: [number, number][] = Array.from({ length: N }, (_, i) => {
    let x = 0, y = 0;
    for (let k = 0; k < N; k++) {
      x += G[i][k] * pc1[k];
      y += G[i][k] * pc2[k];
    }
    return [x, y];
  });

  // Normalize to [-1, 1]
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  return coords.map(([x, y]) => [
    ((x - xMin) / xRange) * 2 - 1,
    ((y - yMin) / yRange) * 2 - 1,
  ]);
}

// --- Shared helpers ---

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as number[]; } catch { return null; }
  }
  return null;
}

// --- Hono App with Auth Check ---

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowHeaders: ["x-brain-key", "content-type"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

function checkAuth(c: { req: { header: (k: string) => string | undefined; url: string } }): boolean {
  const provided = c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  return provided === MCP_ACCESS_KEY;
}

// REST handlers (called from catch-all, path-prefix-agnostic)

async function handleApiLayout(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  try {
    const { data, error } = await supabase
      .from("thoughts")
      .select("id, content, metadata, created_at, embedding")
      .order("created_at", { ascending: true });

    if (error) return c.json({ error: error.message }, 500);
    if (!data || data.length === 0) return c.json({ generated_at: new Date().toISOString(), count: 0, points: [] });

    const valid = data
      .map((t: { id: string; content: string; metadata: Record<string, unknown>; created_at: string; embedding: unknown }) => ({
        ...t,
        _vec: parseEmbedding(t.embedding),
      }))
      .filter((t: { _vec: number[] | null }) => t._vec !== null && t._vec.length > 0);

    if (valid.length === 0) return c.json({ error: "No valid embeddings found", sample: data[0]?.embedding }, 500);

    const vectors = valid.map((t: { _vec: number[] }) => t._vec);
    const coords = pcaTo2D(vectors);

    const points = valid.map((t: { id: string; content: string; metadata: Record<string, unknown>; created_at: string; _vec: number[] }, i: number) => ({
      id: t.id,
      x: coords[i][0],
      y: coords[i][1],
      content: t.content,
      metadata: t.metadata,
      created_at: t.created_at,
    }));

    return c.json({ generated_at: new Date().toISOString(), count: points.length, points });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message, stack: (err as Error).stack }, 500);
  }
}

async function handleApiThoughts(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get("page") || "0");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const type = url.searchParams.get("type");
  const topic = url.searchParams.get("topic");
  const days = url.searchParams.get("days");

  // Build filter once, apply to both count and data queries
  let since: string | null = null;
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(days));
    since = d.toISOString();
  }

  let countQ = supabase.from("thoughts").select("*", { count: "exact", head: true });
  if (type) countQ = countQ.contains("metadata", { type });
  if (topic) countQ = countQ.contains("metadata", { topics: [topic] });
  if (since) countQ = countQ.gte("created_at", since);
  const { count } = await countQ;

  const orderAsc = url.searchParams.get("order") === "asc";
  let dataQ = supabase
    .from("thoughts")
    .select("id, title, content, metadata, created_at")
    .order("created_at", { ascending: orderAsc });
  if (type) dataQ = dataQ.contains("metadata", { type });
  if (topic) dataQ = dataQ.contains("metadata", { topics: [topic] });
  if (since) dataQ = dataQ.gte("created_at", since);
  dataQ = dataQ.range(page * limit, (page + 1) * limit - 1);

  const { data, error } = await dataQ;
  if (error) return c.json({ error: error.message }, 500);

  return c.json({ page, limit, total: count ?? 0, thoughts: data ?? [] });
}

async function handleApiSearch(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  const url = new URL(c.req.url);
  const query = url.searchParams.get("q");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const threshold = parseFloat(url.searchParams.get("threshold") || "0.1");
  if (!query) return c.json({ error: "Missing q parameter" }, 400);
  try {
    const qEmb = await getEmbedding(query);
    const { data, error } = await supabase.rpc("match_thoughts", {
      query_embedding: qEmb,
      match_threshold: threshold,
      match_count: limit,
      filter: {},
    });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ query, results: data ?? [] });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
}

async function handleDeleteThought(c: Parameters<Parameters<typeof app.get>[1]>[0], id: string) {
  const { error } = await supabase.from("thoughts").delete().eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ deleted: true, id });
}

async function handleUpdateThought(c: Parameters<Parameters<typeof app.get>[1]>[0], id: string) {
  const body = await c.req.json().catch(() => null);
  if (!body?.content) return c.json({ error: "Missing content" }, 400);
  const [embedding, extracted] = await Promise.all([
    getEmbedding(body.content),
    extractMetadata(body.content),
  ]);
  const { error } = await supabase.from("thoughts")
    .update({ content: body.content, title: extracted.title, embedding: JSON.stringify(embedding), metadata: extracted.metadata })
    .eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ updated: true, id });
}

async function handleApiNeighbors(c: Parameters<Parameters<typeof app.get>[1]>[0], id: string) {
  try {
    const url = new URL(c.req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 200);
    const threshold = Math.max(0.01, Math.min(1, parseFloat(url.searchParams.get("threshold") || "0.1")));

    // Fetch the thought's embedding
    const { data: thought, error: te } = await supabase
      .from("thoughts")
      .select("id, title, content, metadata, created_at, embedding")
      .eq("id", id)
      .single();

    if (te || !thought) return c.json({ error: "Thought not found" }, 404);

    const embedding = parseEmbedding(thought.embedding);
    if (!embedding) return c.json({ error: "No embedding for this thought" }, 500);

    // Fetch all neighbors above threshold (up to 200 for counting)
    const { data, error } = await supabase.rpc("match_thoughts", {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: 200,
      filter: {},
    });

    if (error) return c.json({ error: error.message }, 500);

    const all = (data || []).filter((t: { id: string }) => t.id !== id);
    const neighbors = all
      .slice(0, limit)
      .map((t: { id: string; title?: string; content: string; metadata: Record<string, unknown>; similarity: number; created_at: string }) => ({
        id: t.id,
        title: t.title || null,
        content: t.content,
        metadata: t.metadata,
        created_at: t.created_at,
        similarity: t.similarity,
      }));

    return c.json({ id, neighbors, total: all.length });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
}

// --- Dream log REST handlers ---

async function handleApiDreamLogBulk(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body?.entries || !Array.isArray(body.entries)) {
      return c.json({ error: "Missing entries array" }, 400);
    }

    const rows = body.entries.map((e: { run_date: string; step: number; thought_id?: string; action: string; detail?: Record<string, unknown> }) => ({
      run_date: e.run_date,
      step: e.step,
      thought_id: e.thought_id || null,
      action: e.action,
      detail: e.detail || {},
    }));

    const { error } = await supabase.from("dream_log").insert(rows);
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ inserted: rows.length });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
}

async function handleApiDreamRuns(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  try {
    const { data, error } = await supabase
      .from("dream_log")
      .select("run_date, action, detail")
      .eq("step", -1)
      .order("run_date", { ascending: false })
      .limit(50);

    if (error) return c.json({ error: error.message }, 500);

    const runs = (data || []).map((r: { run_date: string; action: string; detail: Record<string, unknown> }) => ({
      run_date: r.run_date,
      stats: r.detail?.stats || {},
    }));

    return c.json({ runs });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
}

async function handleApiDreamLog(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
  try {
    const url = new URL(c.req.url);
    const runDate = url.searchParams.get("run_date");
    if (!runDate) return c.json({ error: "Missing run_date parameter" }, 400);

    const { data, error } = await supabase
      .from("dream_log")
      .select("id, run_date, step, thought_id, action, detail, created_at")
      .eq("run_date", runDate)
      .order("created_at", { ascending: true });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ run_date: runDate, entries: data || [] });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
}

async function handleApiDreamLogThought(c: Parameters<Parameters<typeof app.get>[1]>[0], thoughtId: string) {
  try {
    const { data, error } = await supabase
      .from("dream_log")
      .select("id, run_date, step, action, detail, created_at")
      .eq("thought_id", thoughtId)
      .order("created_at", { ascending: true });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ thought_id: thoughtId, entries: data || [] });
  } catch (err: unknown) {
    return c.json({ error: (err as Error).message }, 500);
  }
}

// Single catch-all: REST routes matched by path suffix, MCP for everything else
app.all("*", async (c) => {
  const provided = c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  if (!provided || provided !== MCP_ACCESS_KEY) {
    return c.json({ error: "Invalid or missing access key" }, 401);
  }

  const path = new URL(c.req.url).pathname;

  if (c.req.method === "GET" && path.endsWith("/api/layout")) {
    return handleApiLayout(c);
  }
  if (c.req.method === "GET" && path.endsWith("/api/thoughts")) {
    return handleApiThoughts(c);
  }
  if (c.req.method === "GET" && path.endsWith("/api/search")) {
    return handleApiSearch(c);
  }
  // Dream log endpoints
  if (c.req.method === "POST" && path.endsWith("/api/dream-log")) {
    return handleApiDreamLogBulk(c);
  }
  if (c.req.method === "GET" && path.endsWith("/api/dream-log")) {
    return handleApiDreamLog(c);
  }
  const dreamThoughtMatch = path.match(/\/api\/dream-log\/thought\/([^/?]+)$/);
  if (c.req.method === "GET" && dreamThoughtMatch) {
    return handleApiDreamLogThought(c, dreamThoughtMatch[1]);
  }
  const dreamRunsMatch = path.endsWith("/api/dream-runs");
  if (c.req.method === "GET" && dreamRunsMatch) {
    return handleApiDreamRuns(c);
  }
  const neighborsMatch = path.match(/\/api\/neighbors\/([^/?]+)$/);
  if (c.req.method === "GET" && neighborsMatch) {
    return handleApiNeighbors(c, neighborsMatch[1]);
  }
  const thoughtIdMatch = path.match(/\/api\/thoughts\/([^/?]+)$/);
  if (c.req.method === "DELETE" && thoughtIdMatch) {
    return handleDeleteThought(c, thoughtIdMatch[1]);
  }
  if (c.req.method === "PATCH" && thoughtIdMatch) {
    return handleUpdateThought(c, thoughtIdMatch[1]);
  }

  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

Deno.serve(app.fetch);
