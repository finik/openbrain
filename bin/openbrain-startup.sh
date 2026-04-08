#!/bin/bash
# SessionStart hook: inject Open Brain context into Claude Code session.
# Reads active tasks + recent thoughts via REST API.

source ~/.jarvis/config.sh 2>/dev/null

if [ -z "$OPENBRAIN_URL" ] || [ -z "$OPENBRAIN_KEY" ]; then
  echo "STARTUP: Run your Session Start Checklist from INSTRUCTIONS.md now."
  exit 0
fi

# Fetch tasks (compact list)
TASKS=$(curl -sf -H "x-brain-key: $OPENBRAIN_KEY" \
  "${OPENBRAIN_URL}/api/thoughts?type=task&limit=20&order=desc" 2>/dev/null)

# Fetch recent thoughts
RECENT=$(curl -sf -H "x-brain-key: $OPENBRAIN_KEY" \
  "${OPENBRAIN_URL}/api/thoughts?limit=10&order=desc" 2>/dev/null)

echo "STARTUP: Run your Session Start Checklist from INSTRUCTIONS.md now."
echo ""

if [ -n "$TASKS" ] && [ "$TASKS" != "null" ]; then
  TASK_COUNT=$(echo "$TASKS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null)
  if [ "$TASK_COUNT" -gt 0 ] 2>/dev/null; then
    echo "=== Open Brain Tasks ($TASK_COUNT) ==="
    echo "$TASKS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data.get('thoughts', []):
    m = t.get('metadata', {})
    title = t.get('title') or t.get('content','')[:80]
    print(f\"- [{m.get('type','?')}] {title} (ID: {t['id'][:8]}...)\")
" 2>/dev/null
    echo ""
  fi
fi

if [ -n "$RECENT" ] && [ "$RECENT" != "null" ]; then
  echo "=== Recent Thoughts ==="
  echo "$RECENT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data.get('thoughts', [])[:10]:
    m = t.get('metadata', {})
    title = t.get('title') or t.get('content','')[:80]
    date = t.get('created_at','')[:10]
    print(f\"- [{m.get('type','?')}] {date} {title}\")
" 2>/dev/null
fi
