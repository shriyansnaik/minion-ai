from dataclasses import dataclass, field
from typing import Optional


@dataclass
class _Config:
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    tracing: bool = False
    ui_url: Optional[str] = None


_config = _Config()


def init(
    api_key: str,
    base_url: str = None,
    tracing: bool = False,
    ui_url: str = None,
):
    """Configure the minions library. Call once before creating any Minion.

    Args:
        api_key: Your OpenAI API key.
        base_url: Optional custom endpoint (Azure, vLLM, any OpenAI-compatible API).
        tracing: Enable trace collection.
        ui_url: URL of the minions-ui server (required if tracing=True).
    """
    _config.api_key = api_key
    _config.base_url = base_url
    _config.tracing = tracing
    _config.ui_url = ui_url


def get_config() -> _Config:
    return _config
