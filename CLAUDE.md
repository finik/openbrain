# Open Brain MCP — Project Notes

## Deployment

Deploy the Supabase edge function with `--no-verify-jwt` — this is required because the function uses its own custom auth (`x-brain-key` header) instead of Supabase JWTs. Without this flag, Supabase rejects requests at the gateway before they reach the function.

```bash
supabase functions deploy open-brain-mcp --no-verify-jwt
```

## Dreaming

Nightly consolidation is `bin/dreaming-run.sh` via launchd `net.openbrain.dreaming` (02:17). It uses `pi` with `openrouter/google/gemini-2.5-flash-lite`, not Claude Code, and talks to Open Brain through `bin/ob`. Runtime config/logs/memory live in `~/.jarvis`; do not use `~/jarvis`.

```bash
~/openbrain/bin/dreaming-run.sh
```
