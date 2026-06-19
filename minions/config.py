import logging
from dataclasses import dataclass
from typing import Optional
import litellm

log = logging.getLogger("minions.config")


@dataclass
class _Config:
    tracing: bool = False
    db_path: Optional[str] = None
    project: Optional[str] = None
    trace_url: Optional[str] = None
    tracing_secret_token: Optional[str] = None


_config = _Config()


def _verify_remote_project(trace_url: str, token: str, project: str) -> None:
    """Confirm `token` is actually scoped to `project` before any traces are
    pushed. Without this check the mismatch fails silently: the server
    rejects every push with a 403, but trace_db only logs a warning for it
    (so the agent keeps running), so no error ever surfaces and no traces
    ever appear in the UI."""
    import httpx

    try:
        resp = httpx.get(
            f"{trace_url}/api/ingest/verify",
            params={"project": project},
            headers={"X-Minion-Token": token},
            timeout=5.0,
        )
    except httpx.RequestError as e:
        log.warning("tracing: could not verify project/token against %s (%s) — continuing", trace_url, e)
        return

    if resp.status_code == 401:
        raise ValueError(
            f"trace_url rejected tracing_secret_token: token is invalid or revoked. "
            f"Create a new token for project '{project}' in the dashboard."
        )
    if resp.status_code != 200:
        log.warning(
            "tracing: unexpected %s verifying project '%s' against %s — continuing",
            resp.status_code, project, trace_url,
        )
        return

    data = resp.json()
    if not data.get("match"):
        raise ValueError(
            f"Invalid tracing_secret_token for project '{project}': this token is not scoped "
            f"to that project. Either pass the project name this token was created for, or "
            f"create a new token for '{project}' in the dashboard."
        )


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
    if trace_url:
        _verify_remote_project(trace_url, tracing_secret_token, project)
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
