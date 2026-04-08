#!/usr/bin/env python3
"""Token usage utilities for Jarvis subsystems.

Modes:
  lines <transcript>                     Print line count of transcript JSONL
  count <transcript> [--after-line N]    Sum token usage from assistant messages
  log-json --source NAME                 Read claude --output-format json from stdin,
                                         extract usage, append to token-usage.jsonl,
                                         print the text result to stdout

All token fields are preserved: input_tokens, cache_creation_input_tokens,
cache_read_input_tokens, output_tokens. No lossy aggregation.
"""

import json
import sys
import argparse
from datetime import datetime
from pathlib import Path

TOKEN_LOG = Path.home() / ".jarvis" / "logs" / "token-usage.jsonl"

USAGE_KEYS = [
    "input_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "output_tokens",
]


def count_from_transcript(transcript_path, after_line=0):
    """Sum token usage from assistant messages in a transcript JSONL."""
    totals = {k: 0 for k in USAGE_KEYS}
    totals["turns"] = 0

    with open(transcript_path) as f:
        for i, line in enumerate(f):
            if i < after_line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("type") == "assistant":
                usage = obj.get("message", {}).get("usage", {})
                if usage:
                    totals["turns"] += 1
                    for k in USAGE_KEYS:
                        totals[k] += usage.get(k, 0)

    totals["total_input"] = (
        totals["input_tokens"]
        + totals["cache_creation_input_tokens"]
        + totals["cache_read_input_tokens"]
    )
    return totals


def line_count(path):
    """Count lines in a file."""
    with open(path) as f:
        return sum(1 for _ in f)


def log_usage(source, usage_dict):
    """Append a token usage entry to token-usage.jsonl."""
    entry = {
        "ts": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source": source,
    }
    for k in USAGE_KEYS:
        entry[k] = usage_dict.get(k, 0)
    if "turns" in usage_dict:
        entry["turns"] = usage_dict["turns"]

    TOKEN_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(TOKEN_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Token usage utilities for Jarvis")
    sub = parser.add_subparsers(dest="command")

    # lines: count lines in transcript
    p_lines = sub.add_parser("lines", help="Print line count of transcript JSONL")
    p_lines.add_argument("transcript", help="Path to transcript JSONL")

    # count: sum tokens from transcript
    p_count = sub.add_parser("count", help="Sum token usage from transcript JSONL")
    p_count.add_argument("transcript", help="Path to transcript JSONL")
    p_count.add_argument("--after-line", type=int, default=0,
                         help="Only count from this line onward (0-indexed)")
    p_count.add_argument("--log", metavar="SOURCE",
                         help="Also append results to token-usage.jsonl with this source name")

    # log-json: read claude -p --output-format json from stdin, extract and log usage
    p_log = sub.add_parser("log-json",
                           help="Extract usage from 'claude --output-format json' on stdin")
    p_log.add_argument("--source", required=True,
                       help="Source name for token-usage.jsonl (dreaming, digest, etc.)")

    args = parser.parse_args()

    if args.command == "lines":
        print(line_count(args.transcript))

    elif args.command == "count":
        result = count_from_transcript(args.transcript, args.after_line)
        print(json.dumps(result))
        if args.log:
            log_usage(args.log, result)

    elif args.command == "log-json":
        data = json.load(sys.stdin)
        usage = data.get("usage", {})
        if usage:
            log_usage(args.source, usage)
        # Pass through the text result so launchd log still gets readable output
        result_text = data.get("result", "")
        if result_text:
            print(result_text)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
