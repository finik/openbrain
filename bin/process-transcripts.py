#!/usr/bin/env python3
"""
Jarvis Transcript Memory Processor
Scans Claude Code session transcripts, extracts conversation content,
and sends notable context to Open Brain via claude -p.

Runs every 30 min via launchd (see launchd/ for plist templates).
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

PROJECTS_DIR = Path.home() / ".claude" / "projects"
STATE_FILE = Path(__file__).parent.parent / "logs" / "transcript-state.json"
CLAUDE_BIN = Path.home() / ".local" / "bin" / "claude"

# Only process a session if it has at least this many new lines since last run
MIN_NEW_LINES = 20

# Only send to LLM if the extracted conversation has at least this many chars
MIN_CONVERSATION_CHARS = 500

# Top-level JSONL types to extract (Claude Code format uses 'user'/'assistant' as type)
KEEP_TYPES = {"user", "assistant"}

# ── State management ──────────────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"sessions": {}}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── Transcript discovery ──────────────────────────────────────────────────────

def find_transcripts() -> list[Path]:
    """Find all JSONL transcript files under ~/.claude/projects/"""
    transcripts = []
    if not PROJECTS_DIR.exists():
        return transcripts
    for path in PROJECTS_DIR.rglob("*.jsonl"):
        if path.stat().st_size > 0:
            transcripts.append(path)
    return transcripts


# ── Conversation extraction ───────────────────────────────────────────────────

def extract_text_content(content) -> str:
    """Extract plain text from a message content field (str or list of blocks)."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                block_type = block.get("type", "")
                if block_type == "text":
                    text = block.get("text", "").strip()
                    if text:
                        parts.append(text)
                # Skip: tool_use, tool_result, thinking, image, document
        return "\n".join(parts)
    return ""


def _get_user_text(obj: dict) -> str:
    """Extract text from a user message, skipping tool_result-only messages."""
    message = obj.get("message", {})
    if not message:
        return ""
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Skip if all blocks are tool_result/tool_use (no human text)
        non_tool = [b for b in content if isinstance(b, dict)
                    and b.get("type") not in ("tool_result", "tool_use")]
        if not non_tool:
            return ""
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "")
    return ""


def _detect_operation(text: str) -> str | None:
    """Detect operation type from user message text. Returns None if not a new operation."""
    if "heartbeat-prompt" in text:
        return "heartbeat"
    if "Session Start Checklist" in text:
        return "startup"
    if '<channel source="' in text or "plugin:telegram" in text:
        return "user"
    # Ignore system-reminder-only messages (not a new operation)
    stripped = text.strip()
    if stripped.startswith("<system-reminder>") and stripped.endswith("</system-reminder>"):
        return None
    if stripped:
        return "other"
    return None


USAGE_KEYS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"]


def count_session_tokens(raw_lines: list[str]) -> dict[str, dict]:
    """Count tokens per operation type from raw JSONL lines.

    Identifies operations by user message content, then accumulates
    assistant message usage under the current operation.

    Returns {"heartbeat": {"input_tokens": N, ..., "turns": N}, ...}
    """
    ops: dict[str, dict] = {}
    current_op = "other"

    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_type = obj.get("type", "")

        if msg_type == "user":
            text = _get_user_text(obj)
            if text:
                detected = _detect_operation(text)
                if detected is not None:
                    current_op = detected

        elif msg_type == "assistant":
            usage = obj.get("message", {}).get("usage", {})
            if usage:
                if current_op not in ops:
                    ops[current_op] = {k: 0 for k in USAGE_KEYS}
                    ops[current_op]["turns"] = 0
                ops[current_op]["turns"] += 1
                for k in USAGE_KEYS:
                    ops[current_op][k] += usage.get(k, 0)

    return ops


def extract_conversation_from_lines(raw_lines: list[str]) -> str:
    """Extract human/assistant text from raw JSONL lines."""
    exchanges = []

    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_type = obj.get("type", "")
        if msg_type not in KEEP_TYPES:
            continue

        if obj.get("isMeta"):
            continue

        message = obj.get("message", {})
        if not message:
            continue

        content = message.get("content", "")
        if not content:
            continue

        if isinstance(content, list):
            non_tool = [b for b in content if isinstance(b, dict) and b.get("type") not in ("tool_result", "tool_use")]
            if not non_tool:
                continue

        text = extract_text_content(content)
        if not text:
            continue

        if "<local-command-caveat>" in text or "<command-name>" in text:
            continue

        label = "Human" if msg_type == "user" else "Jarvis"
        exchanges.append(f"{label}: {text}")

    return "\n\n".join(exchanges)


# ── LLM memory extraction ─────────────────────────────────────────────────────

EXTRACTION_PROMPT = """You are analyzing a conversation between a user and their AI assistant Jarvis.

Extract facts, decisions, preferences, and context worth remembering for future sessions.
For each notable item, capture it to Open Brain using the capture_thought tool.

Guidelines:
- Capture: decisions made, new personal facts, technical solutions, project updates, commitments
- Skip: small talk, routine commands, things already well-known
- Each capture should be a standalone statement clear to someone with no prior context
- Quality over quantity: 3 precise captures beat 10 vague ones

Conversation to analyze:
---
{conversation}
---

Capture what's worth remembering. If nothing is notable, do nothing."""


TOKEN_LOG = Path(os.environ.get("JARVIS_WORKSPACE", str(Path.home() / ".jarvis"))) / "logs" / "token-usage.jsonl"


def log_token_usage(source: str, usage: dict) -> None:
    """Append a token usage entry to the shared JSONL log."""
    entry = {
        "ts": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source": source,
        "input_tokens": usage.get("input_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }
    TOKEN_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(TOKEN_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def extract_memories(conversation: str) -> bool:
    """Send conversation to claude -p for memory extraction. Returns True on success."""
    prompt = EXTRACTION_PROMPT.format(conversation=conversation)

    try:
        result = subprocess.run(
            [str(CLAUDE_BIN), "-p", prompt, "--dangerously-skip-permissions", "--no-session-persistence", "--output-format", "json"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(Path.home() / "jarvis"),
        )
        if result.returncode == 0:
            print(f"[{datetime.now().isoformat()}] Memory extraction succeeded")
            try:
                output = json.loads(result.stdout)
                if "usage" in output:
                    log_token_usage("transcripts", output["usage"])
            except (json.JSONDecodeError, KeyError):
                pass
            return True
        else:
            print(f"[{datetime.now().isoformat()}] claude -p failed: {result.stderr[:200]}", file=sys.stderr)
            return False
    except subprocess.TimeoutExpired:
        print(f"[{datetime.now().isoformat()}] claude -p timed out", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] Error: {e}", file=sys.stderr)
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"[{datetime.now().isoformat()}] Transcript processor starting")
    state = load_state()
    sessions = state.setdefault("sessions", {})

    transcripts = find_transcripts()
    print(f"[{datetime.now().isoformat()}] Found {len(transcripts)} transcript(s)")

    processed = 0
    for transcript_path in transcripts:
        session_id = str(transcript_path)
        session_state = sessions.get(session_id, {})

        # Quick size check before parsing
        current_size = transcript_path.stat().st_size
        last_size = session_state.get("last_size_bytes", 0)
        if current_size == last_size:
            continue  # No change at all

        # Read all lines once
        all_lines = transcript_path.read_text(encoding="utf-8", errors="replace").splitlines()
        total_lines = len(all_lines)

        # ── Token accounting (always runs on new lines) ──────────────────
        last_token_line = session_state.get("last_token_line", 0)
        if total_lines > last_token_line:
            new_raw = all_lines[last_token_line:]
            ops = count_session_tokens(new_raw)
            for op_name, usage in ops.items():
                log_token_usage(op_name, usage)
            if ops:
                summary = ", ".join(f"{k}: {v['turns']}t" for k, v in ops.items())
                print(f"[{datetime.now().isoformat()}] Token accounting {transcript_path.name}: {summary}")
            session_state["last_token_line"] = total_lines

        # ── Memory extraction (gated by MIN_NEW_LINES / MIN_CONVERSATION_CHARS)
        last_line_count = session_state.get("last_line_count", 0)
        new_lines = total_lines - last_line_count

        if new_lines < MIN_NEW_LINES:
            # Save token state even when skipping memory extraction
            sessions[session_id] = {**session_state, "last_size_bytes": current_size}
            save_state(state)
            continue

        conversation = extract_conversation_from_lines(all_lines[last_line_count:])

        if len(conversation) < MIN_CONVERSATION_CHARS:
            sessions[session_id] = {
                **session_state,
                "last_processed_at": datetime.now().isoformat(),
                "last_line_count": total_lines,
                "last_size_bytes": current_size,
            }
            save_state(state)
            continue

        print(f"[{datetime.now().isoformat()}] Processing {transcript_path.name}: {new_lines} new lines, {len(conversation)} chars")

        success = extract_memories(conversation)
        if success:
            sessions[session_id] = {
                **session_state,
                "last_processed_at": datetime.now().isoformat(),
                "last_line_count": total_lines,
                "last_size_bytes": current_size,
            }
            save_state(state)
            processed += 1
        else:
            # Save token state even if memory extraction fails
            sessions[session_id] = {**session_state, "last_size_bytes": current_size}
            save_state(state)
            print(f"[{datetime.now().isoformat()}] Failed to process {transcript_path.name}, will retry next run")

    print(f"[{datetime.now().isoformat()}] Done. Processed {processed} transcript(s)")


if __name__ == "__main__":
    main()
