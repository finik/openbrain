# Open Brain Dreaming — Nightly Memory Consolidation

You are running a nightly memory consolidation pass on an Open Brain instance. Today is [DATE], [TIME].

## Configuration (from environment)

- **Log directory**: `$OB_LOG_DIR` — write all logs here
- **Memory file**: `$OB_MEMORY_FILE` — first-tier memory (short-term, always in context)
- **Cursor file**: `$OB_LOG_DIR/dreaming-cursor.txt`

Before doing anything else, read the values of these environment variables so you know the correct paths. Token usage is tracked automatically by the launcher — you do not need to measure your own tokens.

Create a log file at `$OB_LOG_DIR/dreaming-[DATE].md` and write every decision to it as you go. Execute actions and log them inline; do not buffer. If Open Brain returns an error at any point, stop, write the error to the log, and report what completed.

**Dual logging — for every action on a thought, do BOTH:**
1. Write to the local markdown log (human-readable detail)
2. Append one JSON line to `$OB_LOG_DIR/dreaming-log-[DATE].jsonl` (structured, for upload to dream_log table)

**JSONL format** — append one line per action via Bash (`echo '...' >> file`):
```json
{"run_date":"YYYY-MM-DD","step":N,"thought_id":"uuid-or-null","action":"ACTION","detail":{...}}
```

Action types and their detail payloads:
- **delete**: `{ "reason": "...", "content_snapshot": "full content of deleted thought" }`
- **merge**: `{ "reason": "...", "source_ids": ["id1", "id2"], "before": ["content1", "content2"], "after": "merged content" }`
- **augment**: `{ "reason": "...", "before": "old content", "after": "new content" }`
- **keep/bump**: `{ "reason": "..." }`
- **create**: `{ "reason": "...", "content": "new thought content" }`
- **insight**: `{ "urgency": "high|medium|low", "text": "insight text" }`
- **stale**: `{ "reason": "..." }`
- **promote/evict**: `{ "section": "...", "reason": "..." }`

A post-processing script uploads the JSONL and generates summary stats after this process exits — you do NOT need to compute stats or upload anything.

**Local log format for every thought processed:**
- Thought ID, type, topics, created_at
- Full content (verbatim, no truncation)
- Your reasoning for the decision
- The outcome: what action was taken, and if the content changed, show the full before and after

For merges and augments, log both (or all) thoughts involved — full content of each — before showing the merged/augmented result.

Work through the steps below in order.

---

## Step 0: Process queued groups

Before normal processing, handle thoughts that were explicitly queued by the user via the Brain viewer.

**Merge groups** (`merge_group` metadata key):

1. `search_thoughts("merge_group", limit=50)` — find all thoughts with `merge_group` in metadata.
2. Group them by `merge_group` UUID value.
3. For each group: read all thoughts in the group, write one combined thought that preserves all substantive content, capture it, then delete the originals.
4. Log each merge: list all source thought IDs/titles, the merged result, and the group UUID.

**Review groups** (`review_group` metadata key):

1. `search_thoughts("review_group", limit=50)` — find all thoughts with `review_group` in metadata.
2. Group them by `review_group` UUID value.
3. For each group: evaluate the batch together using normal dreaming logic — merge if they cover the same fact, augment if they enrich each other, delete if redundant or stale, keep separate if truly independent.
4. For any thought kept or updated, remove the `review_group` key from its metadata via `update_thought`.
5. Log each decision with full reasoning, same as Step 1.

If no queued groups exist, log "No queued groups" and proceed.

---

## Step 1: Load and process thoughts

**Load the cursor:**
Read `$OB_LOG_DIR/dreaming-cursor.txt`. It contains a single ISO timestamp — the end time of the last dreaming run. If the file doesn't exist or is empty, use 7 days ago as the default.

**Load two batches and merge:**
- New since cursor: `list_thoughts(days=N, limit=100)` — filter to created_at after cursor timestamp
- Oldest 20 by updated_at: `list_thoughts(limit=20, order="asc")`

Merge into one working list (dedup if a thought appears in both). For each thought, note which source it came from: **new** or **old**.

**Process each thought in the merged list:**

For each thought, log its full content verbatim, then decide and log:

**Does it belong in Open Brain?** Delete immediately if it is:
- A time-bound one-shot reminder — belongs in a scheduler, not memory
- A calendar event or schedule entry — belongs in a calendar system
- Pure noise (automated log entries, heartbeat pings with no content)

**Is the type correct?** Types: task, note. "task" for actionable items requiring follow-up; everything else is "note". If the type is an old value (observation, idea, reference, person_note), update it to "note" (or "task" if actionable).

**Is it similar to another thought in this list?**
Call `search_thoughts("[brief summary]", limit=5)` to find related thoughts. Then decide:

**Merge** — two or more thoughts cover the exact same fact. Ask: "If capturing this from scratch today, would I write one thought or two?" If one — merge. Write a single combined thought, capture it, delete the originals.

**Augment** — related but say different things; each enriches the other. Update whichever benefit from the additional context. Neither is deleted.

**Keep separate** — truly independent. No action.

**Bumping rule:**
- **Old thoughts** (from oldest-20 batch): always call `update_thought` after processing — even if kept unchanged. This bumps updated_at so they don't reappear tomorrow.
- **New thoughts** (from cursor batch): do NOT bump unless you actually changed the content. Let them age naturally by updated_at so they eventually surface in the oldest batch.

**After processing all thoughts**, write the current ISO timestamp to `$OB_LOG_DIR/dreaming-cursor.txt` (overwrite).

---

## Step 2: Look for insights

Look across everything seen in Step 1. Ask: is there a pattern that hasn't been explicitly noticed?

Worth capturing:
- Tasks stuck without progress
- A topic recurring in new captures without resolution
- A connection between an old thought and a new one that changes the picture
- Contradictions between thoughts

For each genuine insight, log it and capture a new thought:
`"Dreaming insight [DATE] urgency:high [text]"` — or urgency:medium or urgency:low.

Consumers of Open Brain can query for unseen urgency:high insights and surface them as needed.

If no non-obvious insights emerge, log that and skip. Do not manufacture them.

---

## Step 3: Clean up tasks

`list_thoughts(type="task", limit=50)`

For each task, log its full content verbatim, then log your decision and reasoning:
- Starts with "DONE" or clearly completed → delete
- References a specific past date with no ongoing relevance → delete
- Is a time-bound reminder mislabeled as a task → delete
- Older than 7 days, no updates, no forward deadline → if clearly dead, delete; if uncertain, prepend "[STALE]" and keep one more cycle
- Active and relevant → keep, bump timestamp

---

## Step 4: Update first-tier memory

Read the current contents of `$OB_MEMORY_FILE`.

This file is short-term memory — always loaded in context by the consuming application. It should only contain things that are actively relevant right now: hot tasks, decisions from the last few days, current project state, known issues. Keep it small (under 60 lines).

**Promote** — for each thought processed in Steps 1–3, ask: does this need to be instantly available without searching? Promote if:
- It's an active task due within the next few days
- It's a decision or rule that will affect every session until reversed
- It's a known system issue that would cause confusion if not immediately visible
- It's a project at a critical moment needing daily attention

**Evict** — for each existing entry, ask: is this still hot? Evict to Open Brain (if not already there) or simply remove if:
- The task is done or past its due date
- The decision has been stable for more than a week and doesn't need to be top-of-mind
- The known issue has been resolved
- The project is ongoing but not at a critical moment

Write the updated file with the current date in the "Last updated" line.

---

## Final summary

**Summary thought:**
Capture one summary thought in Open Brain:
`"Dreaming complete [DATE]: Step 0 processed N queued groups (X merge, Y review), Step 1 processed N thoughts (new: X, old: Y — deleted A, merged B, augmented C, kept D), Step 2 generated N insights (X high / Y medium / Z low urgency), Step 3 cleaned N tasks (deleted X, stale Y, kept Z), Step 4 updated memory (added X, evicted Y entries)."`

Do NOT compute stats, append to stats files, or send notifications — the post-processing script handles all of that from the JSONL file.

---

## Constraints

You MAY edit `$OB_MEMORY_FILE` — that is the only non-log file you are allowed to modify.
You MUST append to the JSONL file for every action on a thought — this is how the viewer shows dreaming history.
Do NOT send notifications — consumers handle that from the stats output.
Do NOT compute stats or write to stats files — the post-processing script handles it.
If Open Brain returns an error mid-run, stop and log what completed.
