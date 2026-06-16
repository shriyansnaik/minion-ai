from dataclasses import dataclass
from typing import Optional
import litellm


@dataclass
class _Config:
    tracing: bool = False
    db_path: Optional[str] = None
    project: Optional[str] = None
    trace_url: Optional[str] = None
    tracing_secret_token: Optional[str] = None


_config = _Config()


def init(
    api_key: str = None,
    base_url: str = None,
    tracing: bool = False,
    project: str = None,
    db_path: str = None,
    trace_url: str = None,
    tracing_secret_token: str = None,
):
    """Configure the minions library. Call once before creating any Minion.

    Args:
        api_key: API key for your provider (or set provider-specific env vars like ANTHROPIC_API_KEY).
        base_url: Optional custom endpoint (Azure, vLLM, any OpenAI-compatible API).
        tracing: Enable trace collection. Writes to ~/.minion/traces.db by default.
        project: Project name to group traces under. Required when tracing=True.
        db_path: Override the SQLite database path (local mode only).
        trace_url: Push traces to a remote minion-ui server instead of writing locally.
        tracing_secret_token: Project-scoped token (mni_...) authenticating remote pushes.
    """
    if tracing and not project:
        raise ValueError("project is required when tracing=True")
    if tracing_secret_token and not trace_url:
        raise ValueError("tracing_secret_token requires trace_url")
    if trace_url and not tracing_secret_token:
        raise ValueError("trace_url requires tracing_secret_token")
    if trace_url and not tracing:
        raise ValueError("trace_url requires tracing=True")
    if api_key:
        litellm.api_key = api_key
    if base_url:
        litellm.api_base = base_url
    _config.tracing = tracing
    _config.project = project
    _config.db_path = db_path
    _config.trace_url = trace_url
    _config.tracing_secret_token = tracing_secret_token


def get_config() -> _Config:
    return _config
