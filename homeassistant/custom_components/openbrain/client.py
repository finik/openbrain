"""Minimal MCP Streamable HTTP client for the open-brain-mcp Edge Function.

The server (supabase/functions/open-brain-mcp/index.ts) creates a fresh
McpServer + StreamableHTTPTransport per HTTP request — there is no session
store to persist an `initialize` handshake across separate POSTs, so each
call here is a single self-contained JSON-RPC `tools/call` request. This is
deliberately not a general-purpose MCP client: it knows exactly one server's
behaviour (stateless, one tool call per POST, x-brain-key auth) rather than
implementing the full spec (session ids, resumable streams, elicitation).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import aiohttp

from .const import AUTH_HEADER

_LOGGER = logging.getLogger(__name__)


class OpenBrainError(Exception):
    """Raised when the Edge Function can't be reached or returns an error."""


class OpenBrainClient:
    """Calls open-brain-mcp's MCP endpoint over Streamable HTTP."""

    def __init__(self, session: aiohttp.ClientSession, url: str, access_key: str) -> None:
        self._session = session
        self._url = url.rstrip("/")
        self._headers = {
            AUTH_HEADER: access_key,
            "Content-Type": "application/json",
            # Streamable HTTP servers may answer either way; accepting both
            # means a compliant server picks whichever it prefers rather
            # than 406-ing us for being too strict.
            "Accept": "application/json, text/event-stream",
        }

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        """Call one MCP tool and return its text content, joined.

        Raises OpenBrainError on a transport failure, a JSON-RPC error
        response, or a tool result with isError=true — the three distinct
        ways this can fail, all surfaced the same way to the caller since
        an LLM tool call only has one way to report "it didn't work".
        """
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        try:
            async with self._session.post(
                self._url, json=payload, headers=self._headers, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 401:
                    raise OpenBrainError("Rejected by the server — check the access key")
                if resp.status >= 400:
                    body = await resp.text()
                    raise OpenBrainError(f"HTTP {resp.status}: {body[:500]}")
                content_type = resp.headers.get("Content-Type", "")
                body = await resp.text()
        except aiohttp.ClientError as err:
            raise OpenBrainError(f"Could not reach Open Brain: {err}") from err

        message = _parse_response_body(body, content_type)
        return _extract_text(message)


def _parse_response_body(body: str, content_type: str) -> dict[str, Any]:
    """A Streamable HTTP response is either a bare JSON-RPC object or one
    SSE-framed event containing one. A single tool call never streams
    multiple events, so taking the last `data:` line is exact, not a
    heuristic."""
    if "text/event-stream" in content_type:
        data_lines = [
            line[len("data:"):].strip()
            for line in body.splitlines()
            if line.startswith("data:")
        ]
        if not data_lines:
            raise OpenBrainError(f"Empty SSE response: {body[:300]}")
        body = data_lines[-1]
    try:
        message: dict[str, Any] = json.loads(body)
    except json.JSONDecodeError as err:
        raise OpenBrainError(f"Unparseable response: {body[:300]}") from err
    if "error" in message:
        err = message["error"]
        raise OpenBrainError(err.get("message", str(err)) if isinstance(err, dict) else str(err))
    return message


def _extract_text(message: dict[str, Any]) -> str:
    result = message.get("result")
    if not isinstance(result, dict):
        raise OpenBrainError(f"Malformed MCP response (no result): {message}")
    blocks = result.get("content") or []
    text = "\n".join(
        b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"
    )
    if result.get("isError"):
        raise OpenBrainError(text or "Open Brain reported an error with no message")
    return text or "(empty response)"
