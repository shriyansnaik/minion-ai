from dataclasses import dataclass
from typing import Optional
import litellm


@dataclass
class _Config:
    tracing: bool = False
    ui_url: Optional[str] = None


_config = _Config()


def init(
    api_key: str = None,
    base_url: str = None,
    tracing: bool = False,
    ui_url: str = None,
):
    """Configure the minions library. Call once before creating any Minion.

    Args:
        api_key: API key for your provider (or set provider-specific env vars like ANTHROPIC_API_KEY).
        base_url: Optional custom endpoint (Azure, vLLM, any OpenAI-compatible API).
        tracing: Enable trace collection.
        ui_url: URL of the minions-ui server (required if tracing=True).
    """
    if api_key:
        litellm.api_key = api_key
    if base_url:
        litellm.api_base = base_url
    _config.tracing = tracing
    _config.ui_url = ui_url


def get_config() -> _Config:
    return _config
