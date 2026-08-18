"""Config flow — the only place the access key is ever entered.

Stored in the config entry (HA's normal encrypted-at-rest storage,
.storage/core.config_entries on the HA host), never in this repo. Tests the
key against a real call before accepting it, so a typo is caught here
rather than surfacing later as a silent tool failure to the LLM.
"""

from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .client import OpenBrainClient, OpenBrainError
from .const import CONF_ACCESS_KEY, CONF_URL, DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL): str,
        vol.Required(CONF_ACCESS_KEY): str,
    }
)


async def _test_connection(hass: HomeAssistant, url: str, access_key: str) -> None:
    """Raise OpenBrainError if the URL/key don't actually work.

    thought_stats takes no arguments and touches the real DB round-trip
    (count + a metadata scan), so a success here means the whole chain —
    network reachability, auth, and the Supabase function itself — is
    genuinely working, not just that the URL parses.
    """
    session = async_get_clientsession(hass)
    client = OpenBrainClient(session, url, access_key)
    await client.call_tool("thought_stats", {})


class OpenBrainConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Single-step setup: Function URL + access key."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            # Only one Open Brain instance makes sense per Home Assistant —
            # see llm_api.py's single-instance assumption.
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()

            url = user_input[CONF_URL].strip()
            access_key = user_input[CONF_ACCESS_KEY].strip()
            try:
                await _test_connection(self.hass, url, access_key)
            except OpenBrainError as err:
                _LOGGER.warning("Open Brain connection test failed: %s", err)
                errors["base"] = "cannot_connect"
            except aiohttp.ClientError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title="Open Brain",
                    data={CONF_URL: url, CONF_ACCESS_KEY: access_key},
                )

        return self.async_show_form(
            step_id="user", data_schema=STEP_USER_SCHEMA, errors=errors
        )
