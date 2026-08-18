"""Exposes Open Brain's tools to Home Assistant conversation agents.

Mirrors supabase/functions/open-brain-mcp/index.ts's server.registerTool(...)
calls one-for-one: same names, same parameters, same descriptions — an
agent that already knows how to use Open Brain through Claude's MCP
connection should need no relearning here. Parameter schemas are hand-
translated from the server's Zod schemas (see the comment on each tool)
rather than generated, since HA tools take a voluptuous Schema, not JSON
Schema, and the two aren't a mechanical 1:1 anyway (voluptuous has no
native "enum of strings" shorthand as terse as zod's z.enum()).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.helpers import llm
from homeassistant.util.json import JsonObjectType

from .client import OpenBrainClient, OpenBrainError
from .const import DOMAIN

API_PROMPT = (
    "Open Brain is the user's persistent memory — thoughts, notes, tasks, and "
    "decisions captured over time, searchable by meaning (not just keywords). "
    "Typical flow: search_thoughts or list_thoughts with compact=true to scan "
    "titles cheaply, then get_thought(id) for the full content of just the "
    "ones that matter. Use capture_thought whenever the user says something "
    "worth remembering later — a decision, a preference, an idea — not only "
    "when they explicitly say 'remember this'."
)


class OpenBrainTool(llm.Tool):
    """One MCP tool, forwarded through OpenBrainClient.call_tool()."""

    def __init__(self, name: str, description: str, parameters: vol.Schema) -> None:
        self.name = name
        self.description = description
        self.parameters = parameters

    async def async_call(
        self, hass: HomeAssistant, tool_input: llm.ToolInput, llm_context: llm.LLMContext
    ) -> JsonObjectType:
        # Single-instance assumption: one Open Brain per Home Assistant, so
        # one client under DOMAIN rather than keyed per config entry. If a
        # second instance is ever added, this is the line that needs to grow
        # a lookup by entry_id.
        client: OpenBrainClient = hass.data[DOMAIN]["client"]
        try:
            text = await client.call_tool(self.name, tool_input.tool_args)
        except OpenBrainError as err:
            return {"error": str(err)}
        return {"result": text}


def _build_tools() -> list[llm.Tool]:
    return [
        OpenBrainTool(
            "search_thoughts",
            "Search captured thoughts using hybrid full-text + semantic search. "
            "Supports compact mode for progressive disclosure — use compact=true "
            "to get titles only, then get_thought(id) for full content.",
            vol.Schema(
                {
                    vol.Required("query"): str,
                    vol.Optional("limit", default=10): int,
                    vol.Optional("threshold", default=0.5): vol.Coerce(float),
                    vol.Optional("compact", default=False): bool,
                    vol.Optional("type"): str,
                }
            ),
        ),
        OpenBrainTool(
            "list_thoughts",
            "List recently captured thoughts with optional filters. Use "
            "compact=true for progressive disclosure — scan titles first, then "
            "get_thought(id) for full content.",
            vol.Schema(
                {
                    vol.Optional("limit", default=10): int,
                    vol.Optional("type"): str,
                    vol.Optional("topic"): str,
                    vol.Optional("person"): str,
                    vol.Optional("days"): int,
                    vol.Optional("order", default="desc"): vol.In(["asc", "desc"]),
                    vol.Optional("order_by", default="created_at"): vol.In(
                        ["created_at", "updated_at"]
                    ),
                    vol.Optional("compact", default=False): bool,
                }
            ),
        ),
        OpenBrainTool(
            "thought_stats",
            "Get a summary of all captured thoughts: totals, types, top "
            "topics, and people.",
            vol.Schema({}),
        ),
        OpenBrainTool(
            "capture_thought",
            "Save a new thought to Open Brain. Generates an embedding and "
            "extracts metadata automatically. Use this when the user says "
            "something worth saving — notes, insights, decisions.",
            vol.Schema(
                {
                    vol.Required("content"): str,
                }
            ),
        ),
        OpenBrainTool(
            "delete_thought",
            "Permanently delete a thought from Open Brain by its ID. Use "
            "search_thoughts or list_thoughts first to find the ID.",
            vol.Schema({vol.Required("id"): str}),
        ),
        OpenBrainTool(
            "update_thought",
            "Update the content of an existing thought. Regenerates the "
            "embedding and metadata automatically. Use search_thoughts or "
            "list_thoughts first to find the ID.",
            vol.Schema({vol.Required("id"): str, vol.Required("content"): str}),
        ),
        OpenBrainTool(
            "get_thought",
            "Fetch the full content of a thought by ID. Use after "
            "search_thoughts(compact=true) or list_thoughts(compact=true) to "
            "retrieve details for specific results.",
            vol.Schema({vol.Required("id"): str}),
        ),
    ]


@dataclass(slots=True, kw_only=True)
class OpenBrainAPI(llm.API):
    """The llm.API Assist exposes to a conversation agent's tool list."""

    async def async_get_api_instance(self, llm_context: llm.LLMContext) -> llm.APIInstance:
        return llm.APIInstance(
            api=self,
            api_prompt=API_PROMPT,
            llm_context=llm_context,
            tools=_build_tools(),
        )
