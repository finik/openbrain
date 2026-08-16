#!/bin/bash
# Nightly Open Brain dreaming. No ~/jarvis dependency.
# Runtime config/logs live in ~/.jarvis; code lives in this repo.
set -euo pipefail

OB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${OB_CONFIG:-$HOME/.jarvis/config.sh}"

if [ ! -f "$CONFIG" ]; then
  echo "Missing config: $CONFIG" >&2
  exit 78
fi

# shellcheck disable=SC1090
source "$CONFIG"

export OB_DIR
export OB_LOG_DIR="${OB_LOG_DIR:-$HOME/.jarvis/logs}"
export OB_MEMORY_FILE="${OB_MEMORY_FILE:-$HOME/.jarvis/MEMORY.md}"
export OB_STATS_DIR="${OB_STATS_DIR:-$OB_LOG_DIR}"
export OPENBRAIN_URL OPENBRAIN_KEY

: "${OPENBRAIN_URL:?OPENBRAIN_URL not set in $CONFIG}"
: "${OPENBRAIN_KEY:?OPENBRAIN_KEY not set in $CONFIG}"

export PATH="$OB_DIR/bin:$HOME/.nvm/versions/node/v26.3.1/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

DATE=$(date +%Y-%m-%d)
TIME=$(date '+%H:%M %Z')
mkdir -p "$OB_LOG_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] dreaming-run start date=$DATE cwd=$OB_DIR" 

PROMPT_FILE=$(mktemp)
trap 'rm -f "$PROMPT_FILE"' EXIT
sed -e "s/\[DATE\]/$DATE/g" -e "s/\[TIME\]/$TIME/g" "$OB_DIR/prompts/dreams-prompt.md" > "$PROMPT_FILE"

PI_BIN="$(command -v pi || true)"
if [ -z "$PI_BIN" ]; then
  echo "pi not found on PATH=$PATH" >&2
  exit 78
fi

set +e
"$PI_BIN" --print --approve --no-session --no-context-files \
  --provider openrouter --model google/gemini-2.5-flash-lite --thinking off \
  --append-system-prompt "You are running unattended Open Brain memory consolidation. Use the ob CLI ($OB_DIR/bin/ob) for all Open Brain reads and writes. Do not ask questions. Follow the dreaming prompt exactly. Write logs as instructed." \
  -p "Execute the Open Brain dreaming process now. Today is $DATE, $TIME.

$(cat "$PROMPT_FILE")"
PI_STATUS=$?
set -e

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] pi exited $PI_STATUS"

if ! "$OB_DIR/bin/dreaming-post.sh"; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] dreaming-post.sh failed" >&2
  exit 1
fi

exit "$PI_STATUS"
