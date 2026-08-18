"""Open Brain — exposes a self-hosted memory system to Assist conversation agents."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import llm
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .client import OpenBrainClient
from .const import CONF_ACCESS_KEY, CONF_URL, DOMAIN
from .llm_api import OpenBrainAPI

_LOGGER = logging.getLogger(__name__)

# No entities/platforms — this integration's only surface is the llm.API it
# registers, not anything that shows up as a device or sensor.
PLATFORMS: list[str] = []


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = async_get_clientsession(hass)
    client = OpenBrainClient(
        session, entry.data[CONF_URL], entry.data[CONF_ACCESS_KEY]
    )

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["client"] = client

    unregister = llm.async_register_api(
        hass, OpenBrainAPI(hass=hass, id=DOMAIN, name="Open Brain")
    )
    hass.data[DOMAIN]["unregister_api"] = unregister

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    data = hass.data.pop(DOMAIN, None)
    if data and "unregister_api" in data:
        data["unregister_api"]()
    return True
