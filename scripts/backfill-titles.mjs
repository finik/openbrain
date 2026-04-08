#!/usr/bin/env node
/**
 * Backfill titles and migrate types for existing Open Brain thoughts.
 * Uses the Open Brain REST API (same endpoints as the viewer).
 *
 * Usage:
 *   OPENBRAIN_URL=https://xxx.supabase.co/functions/v1/open-brain-mcp \
 *   OPENBRAIN_KEY=xxx \
 *   node openbrain/scripts/backfill-titles.mjs
 */

const BRAIN_URL = process.env.OPENBRAIN_URL;
const BRAIN_KEY = process.env.OPENBRAIN_KEY;

if (!BRAIN_URL || !BRAIN_KEY) {
  console.error("Set OPENBRAIN_URL and OPENBRAIN_KEY env vars");
  process.exit(1);
}

const headers = { "x-brain-key": BRAIN_KEY, "Content-Type": "application/json" };

async function fetchThoughts(page = 0, limit = 50) {
  const url = `${BRAIN_URL}/api/thoughts?page=${page}&limit=${limit}&order=asc`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Fetch failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function updateThought(id, content) {
  const url = `${BRAIN_URL}/api/thoughts/${id}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`Update failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  // Fetch all thoughts
  let allThoughts = [];
  let page = 0;
  while (true) {
    const data = await fetchThoughts(page, 50);
    allThoughts = allThoughts.concat(data.thoughts || []);
    if (allThoughts.length >= data.total) break;
    page++;
  }

  console.log(`Fetched ${allThoughts.length} thoughts`);

  // Filter to those without titles
  const needsTitle = allThoughts.filter(t => !t.title);
  console.log(`${needsTitle.length} need titles (${allThoughts.length - needsTitle.length} already have titles)`);

  let processed = 0;
  let errors = 0;

  for (const thought of needsTitle) {
    try {
      // PATCH with same content triggers re-extraction of title + metadata on server
      await updateThought(thought.id, thought.content);
      processed++;
      const preview = thought.content.slice(0, 60).replace(/\n/g, " ");
      console.log(`  [${processed}/${needsTitle.length}] ${thought.id.slice(0, 8)}... "${preview}..."`);

      // Rate limit: ~5/sec to be safe with OpenRouter
      if (processed % 5 === 0) {
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch (err) {
      console.error(`  ERROR ${thought.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Processed: ${processed}, Errors: ${errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
