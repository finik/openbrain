/**
 * Backfill script: generate titles and migrate types for existing thoughts.
 *
 * Usage:
 *   export SUPABASE_URL=https://xxx.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=xxx
 *   export OPENROUTER_API_KEY=xxx
 *   deno run --allow-net --allow-env openbrain/scripts/backfill-titles.ts
 *
 * This script:
 * 1. Fetches all thoughts without a title
 * 2. Generates title via gpt-4o-mini (same extractMetadata call as MCP server)
 * 3. Migrates old types (observation/idea/reference/person_note) to "note"
 * 4. Updates each thought (triggers search_vector population via DB trigger)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENROUTER_API_KEY) {
  console.error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extractTitleAndType(content: string): Promise<{ title: string; type: string }> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          content: `Given a thought/note, return JSON with:
- "title": a concise ~10 word title summarizing it
- "type": "task" if it's an actionable item requiring follow-up, otherwise "note"`,
        },
        { role: "user", content },
      ],
    }),
  });
  const d = await r.json();
  try {
    const parsed = JSON.parse(d.choices[0].message.content);
    return {
      title: parsed.title || content.slice(0, 80),
      type: parsed.type === "task" ? "task" : "note",
    };
  } catch {
    return { title: content.slice(0, 80), type: "note" };
  }
}

async function main() {
  // Fetch all thoughts
  const { data: thoughts, error } = await supabase
    .from("thoughts")
    .select("id, content, title, metadata")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch thoughts:", error.message);
    Deno.exit(1);
  }

  const toProcess = thoughts?.filter((t) => !t.title) || [];
  console.log(`Found ${thoughts?.length} total thoughts, ${toProcess.length} need titles`);

  let processed = 0;
  let errors = 0;

  for (const thought of toProcess) {
    try {
      const { title, type } = await extractTitleAndType(thought.content);

      // Migrate old types
      const currentType = thought.metadata?.type;
      const newType = currentType === "task" ? "task" : type;
      const updatedMetadata = { ...thought.metadata, type: newType };

      const { error: updateError } = await supabase
        .from("thoughts")
        .update({ title, metadata: updatedMetadata })
        .eq("id", thought.id);

      if (updateError) {
        console.error(`  Error updating ${thought.id}: ${updateError.message}`);
        errors++;
      } else {
        processed++;
        console.log(`  [${processed}/${toProcess.length}] ${thought.id} → "${title}" (${newType})`);
      }

      // Rate limit: 10 per second for gpt-4o-mini
      if (processed % 10 === 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    } catch (err) {
      console.error(`  Error processing ${thought.id}:`, err);
      errors++;
    }
  }

  // Also migrate types for thoughts that already have titles (if any)
  const typeMigration = thoughts?.filter(
    (t) => t.title && t.metadata?.type && !["task", "note"].includes(t.metadata.type)
  ) || [];

  for (const thought of typeMigration) {
    const newType = thought.metadata.type === "task" ? "task" : "note";
    await supabase
      .from("thoughts")
      .update({ metadata: { ...thought.metadata, type: newType } })
      .eq("id", thought.id);
    console.log(`  Type migrated: ${thought.id} ${thought.metadata.type} → ${newType}`);
  }

  console.log(`\nDone. Processed: ${processed}, Type migrations: ${typeMigration.length}, Errors: ${errors}`);
}

main();
