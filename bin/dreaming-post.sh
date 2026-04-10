#!/bin/bash
# Open Brain post-dreaming script: upload JSONL log to Supabase, generate summary stats.
# Runs after the dreaming process (claude -p) finishes.
#
# Required environment variables:
#   OPENBRAIN_URL  — Edge function URL
#   OPENBRAIN_KEY  — x-brain-key for authentication
#   OB_LOG_DIR     — Directory containing dreaming logs
#   OB_STATS_DIR   — Directory to write summary stats JSON

set -euo pipefail

: "${OPENBRAIN_URL:?OPENBRAIN_URL not set}"
: "${OPENBRAIN_KEY:?OPENBRAIN_KEY not set}"
: "${OB_LOG_DIR:?OB_LOG_DIR not set}"
: "${OB_STATS_DIR:=$OB_LOG_DIR}"

DATE=$(date +%Y-%m-%d)
JSONL_FILE="$OB_LOG_DIR/dreaming-log-${DATE}.jsonl"
SUMMARY_FILE="$OB_STATS_DIR/dreaming-summary-${DATE}.json"

if [ ! -f "$JSONL_FILE" ]; then
  echo "No dreaming log file found: $JSONL_FILE"
  exit 0
fi

LINES=$(wc -l < "$JSONL_FILE" | tr -d ' ')
if [ "$LINES" -eq 0 ]; then
  echo "Empty dreaming log, skipping upload."
  exit 0
fi

echo "Uploading $LINES dream log entries to Supabase..."

# Build JSON array from JSONL
ENTRIES=$(python3 -c "
import json, sys
entries = []
for line in open('$JSONL_FILE'):
    line = line.strip()
    if line:
        entries.append(json.loads(line))
print(json.dumps({'entries': entries}))
")

# Upload to edge function
HTTP_CODE=$(curl -s -o /tmp/dream-upload-response.json -w '%{http_code}' \
  -X POST "${OPENBRAIN_URL}/api/dream-log" \
  -H "x-brain-key: ${OPENBRAIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$ENTRIES")

if [ "$HTTP_CODE" -eq 200 ]; then
  INSERTED=$(python3 -c "import json; print(json.load(open('/tmp/dream-upload-response.json')).get('inserted', 0))")
  echo "Uploaded $INSERTED entries."
else
  echo "Upload failed (HTTP $HTTP_CODE):"
  cat /tmp/dream-upload-response.json
  exit 1
fi

# Generate summary stats from JSONL
python3 -c "
import json

entries = []
for line in open('$JSONL_FILE'):
    line = line.strip()
    if line:
        entries.append(json.loads(line))

stats = {
    'date': '$DATE',
    'total_actions': len(entries),
    'by_step': {},
    'by_action': {},
}

for e in entries:
    step = str(e.get('step', '?'))
    action = e.get('action', '?')
    stats['by_step'][step] = stats['by_step'].get(step, 0) + 1
    stats['by_action'][action] = stats['by_action'].get(action, 0) + 1

# Write summary JSON for consumers (e.g. daily digest)
with open('$SUMMARY_FILE', 'w') as f:
    json.dump(stats, f, indent=2)

# Append to stats JSONL for historical tracking
stats_line = {
    'date': '$DATE',
    'dreaming': {
        'processed': stats['by_action'].get('keep', 0) + stats['by_action'].get('bump', 0) + stats['by_action'].get('delete', 0) + stats['by_action'].get('merge', 0) + stats['by_action'].get('augment', 0),
        'deleted': stats['by_action'].get('delete', 0),
        'merged': stats['by_action'].get('merge', 0),
        'augmented': stats['by_action'].get('augment', 0),
        'kept': stats['by_action'].get('keep', 0) + stats['by_action'].get('bump', 0),
        'insights': stats['by_action'].get('insight', 0),
        'tasks_cleaned': stats['by_step'].get('3', 0),
    }
}
with open('$OB_STATS_DIR/openbrain-stats.jsonl', 'a') as f:
    f.write(json.dumps(stats_line) + '\n')

print(f\"Dreaming {stats['date']}: {stats['total_actions']} actions\")
for action, count in sorted(stats['by_action'].items(), key=lambda x: -x[1]):
    print(f\"  {action}: {count}\")
"

echo "Summary written to $SUMMARY_FILE"
