"""Constants for the Open Brain integration."""

DOMAIN = "openbrain"

CONF_URL = "url"
CONF_ACCESS_KEY = "access_key"

# Header the open-brain-mcp Edge Function checks — see
# supabase/functions/open-brain-mcp/index.ts, app.all("*", ...).
AUTH_HEADER = "x-brain-key"

# Mirrors index.ts's server.registerTool(...) calls. Kept as one list (not
# discovered at runtime) because the API prompt shown to the conversation
# agent is built from these descriptions before any network call happens —
# an integration that can't reach the server should still tell the LLM what
# it *would* be able to do, and fail per-call instead of at setup.
TOOL_NAMES = (
    "search_thoughts",
    "list_thoughts",
    "thought_stats",
    "capture_thought",
    "delete_thought",
    "update_thought",
    "get_thought",
)
