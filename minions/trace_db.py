import hashlib
import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine

log = logging.getLogger("minions.trace")

_engine: Engine | None = None
_initialized = False
_remote_client = None  # httpx.Client when remote push is configured


def _normalize_url(url: str) -> str:
    """Route bare postgresql:// URLs through the psycopg (v3) driver."""
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _db_url() -> str:
    # DATABASE_URL is the server-side selector (SQLite or Postgres); MINION_DB_PATH
    # and db_path are the local-mode SQLite overrides.
    env = os.environ.get("DATABASE_URL") or os.environ.get("MINION_DB_PATH")
    if env:
        if not env.startswith(("sqlite", "postgresql")):
            return f"sqlite:///{env}"
        return _normalize_url(env)
    try:
        from .config import get_config
        cfg = get_config()
        if cfg.db_path:
            p = cfg.db_path
            if not p.startswith(("sqlite", "postgresql")):
                return f"sqlite:///{p}"
            return _normalize_url(p)
    except Exception:
        pass
    p = Path.home() / ".minion" / "traces.db"
    p.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{p}"


def _remote():
    """Return (httpx.Client, project_name) when remote push is configured in
    minions.init(), else None. The client is created once and reused."""
    global _remote_client
    try:
        from .config import get_config
        cfg = get_config()
    except Exception:
        return None
    if not getattr(cfg, "trace_url", None):
        return None
    if _remote_client is None:
        import httpx
        _remote_client = httpx.Client(
            base_url=cfg.trace_url,
            headers={"X-Minion-Token": cfg.tracing_secret_token or ""},
            timeout=3.0,
        )
    return _remote_client, cfg.project


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = _db_url()
        kwargs: dict = {}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"timeout": 5, "check_same_thread": False}
        _engine = create_engine(url, **kwargs)
        if _engine.dialect.name == "sqlite":
            @event.listens_for(_engine, "connect")
            def _set_wal(dbapi_conn, _):
                dbapi_conn.execute("PRAGMA journal_mode=WAL")
    return _engine


def _run_migrations(engine: Engine) -> None:
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        alembic_command.upgrade(cfg, "head")


def _ensure_init() -> None:
    global _initialized
    if _initialized:
        return
    try:
        _run_migrations(get_engine())
        _initialized = True
    except Exception as e:
        log.warning("tracing: failed to initialize DB — %s", e)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_project(name: str) -> str | None:
    # In remote mode the server owns projects (resolved via the token); the
    # client never needs a local project id.
    if _remote():
        return None
    _ensure_init()
    try:
        project_id = str(uuid.uuid4())
        with get_engine().begin() as conn:
            conn.execute(
                text("INSERT INTO projects (id, name, created_at) VALUES (:id, :name, :created_at)"
                     " ON CONFLICT (name) DO NOTHING"),
                {"id": project_id, "name": name, "created_at": _now()},
            )
            row = conn.execute(
                text("SELECT id FROM projects WHERE name=:name"), {"name": name}
            ).mappings().fetchone()
            return row["id"] if row else None
    except Exception as e:
        log.warning("tracing: failed to ensure project — %s", e)
        return None


def create_run(
    model: str,
    input: str,
    parent_trace_id: str = None,
    project_id: str = None,
    tags: list = None,
    metadata: dict = None,
    system_prompt: str = None,
    tools: list = None,
    trace_id: str = None,
    created_at: str = None,
) -> str | None:
    trace_id = trace_id or str(uuid.uuid4())
    created_at = created_at or _now()

    remote = _remote()
    if remote:
        client, project = remote
        try:
            client.post("/api/ingest/runs", json={
                "project": project,
                "run_id": trace_id,
                "model": model,
                "input": input,
                "created_at": created_at,
                "parent_trace_id": parent_trace_id,
                "tags": tags or [],
                "metadata": metadata or {},
                "system_prompt": system_prompt,
                "tools": tools or [],
            })
        except Exception as e:
            log.warning("tracing: remote create_run failed — %s", e)
        return trace_id

    _ensure_init()
    try:
        with get_engine().begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO runs"
                    " (id, created_at, model, status, system_prompt, input,"
                    "  parent_trace_id, project_id, tags, metadata, tools)"
                    " VALUES (:id, :created_at, :model, 'running', :system_prompt, :input,"
                    "  :parent_trace_id, :project_id, :tags, :metadata, :tools)"
                ),
                {
                    "id": trace_id,
                    "created_at": created_at,
                    "model": model,
                    "system_prompt": system_prompt,
                    "input": input,
                    "parent_trace_id": parent_trace_id,
                    "project_id": project_id,
                    "tags": json.dumps(tags or []),
                    "metadata": json.dumps(metadata or {}),
                    "tools": json.dumps(tools or []),
                },
            )
        return trace_id
    except Exception as e:
        log.warning("tracing: failed to create run — %s", e)
        return None


def append_turn(
    trace_id: str,
    turn_number: int,
    thought: str,
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    tool_calls: list[dict],
) -> None:
    remote = _remote()
    if remote:
        client, _ = remote
        try:
            client.post(f"/api/ingest/runs/{trace_id}/turns", json={
                "turn_number": turn_number,
                "thought": thought,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "tool_calls": [
                    {
                        "tool_name": tc["tool_name"],
                        "args": tc["args"],
                        "result": str(tc["result"]),
                        "latency_ms": tc["latency_ms"],
                    }
                    for tc in tool_calls
                ],
            })
        except Exception as e:
            log.warning("tracing: remote append_turn failed — %s", e)
        return

    try:
        turn_id = str(uuid.uuid4())
        with get_engine().begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO turns"
                    " (id, trace_id, turn_number, thought, input_tokens, output_tokens, latency_ms)"
                    " VALUES (:id, :trace_id, :turn_number, :thought, :input_tokens, :output_tokens, :latency_ms)"
                ),
                {
                    "id": turn_id,
                    "trace_id": trace_id,
                    "turn_number": turn_number,
                    "thought": thought,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "latency_ms": latency_ms,
                },
            )
            for seq, tc in enumerate(tool_calls):
                conn.execute(
                    text(
                        "INSERT INTO tool_calls (id, turn_id, tool_name, args, result, latency_ms, seq)"
                        " VALUES (:id, :turn_id, :tool_name, :args, :result, :latency_ms, :seq)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "turn_id": turn_id,
                        "tool_name": tc["tool_name"],
                        "args": json.dumps(tc["args"]),
                        "result": str(tc["result"]),
                        "latency_ms": tc["latency_ms"],
                        "seq": seq,
                    },
                )
    except Exception as e:
        log.warning("tracing: failed to write turn %d — %s", turn_number, e)


def finish_run(
    trace_id: str,
    output: str,
    total_input_tokens: int,
    total_output_tokens: int,
    total_latency_ms: int,
) -> None:
    remote = _remote()
    if remote:
        client, _ = remote
        try:
            client.patch(f"/api/ingest/runs/{trace_id}", json={
                "status": "completed",
                "output": output,
                "total_input_tokens": total_input_tokens,
                "total_output_tokens": total_output_tokens,
                "total_latency_ms": total_latency_ms,
            })
        except Exception as e:
            log.warning("tracing: remote finish_run failed — %s", e)
        return

    try:
        with get_engine().begin() as conn:
            conn.execute(
                text(
                    "UPDATE runs SET status='completed', finished_at=:finished_at, output=:output,"
                    " total_input_tokens=:total_input_tokens, total_output_tokens=:total_output_tokens,"
                    " total_latency_ms=:total_latency_ms WHERE id=:id"
                ),
                {
                    "finished_at": _now(),
                    "output": output,
                    "total_input_tokens": total_input_tokens,
                    "total_output_tokens": total_output_tokens,
                    "total_latency_ms": total_latency_ms,
                    "id": trace_id,
                },
            )
    except Exception as e:
        log.warning("tracing: failed to finish run — %s", e)


def fail_run(trace_id: str) -> None:
    remote = _remote()
    if remote:
        client, _ = remote
        try:
            client.patch(f"/api/ingest/runs/{trace_id}", json={"status": "failed"})
        except Exception as e:
            log.warning("tracing: remote fail_run failed — %s", e)
        return

    try:
        with get_engine().begin() as conn:
            conn.execute(
                text("UPDATE runs SET status='failed', finished_at=:finished_at WHERE id=:id"),
                {"finished_at": _now(), "id": trace_id},
            )
    except Exception as e:
        log.warning("tracing: failed to mark run as failed — %s", e)


def upsert_custom_model(
    project_id: str,
    model_name: str,
    input_price_per_mtok: float,
    output_price_per_mtok: float,
) -> dict | None:
    _ensure_init()
    try:
        with get_engine().begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO custom_models"
                    " (id, project_id, model_name, input_price_per_mtok, output_price_per_mtok, created_at)"
                    " VALUES (:id, :project_id, :model_name, :input_price_per_mtok, :output_price_per_mtok, :created_at)"
                    " ON CONFLICT(project_id, model_name) DO UPDATE SET"
                    "   input_price_per_mtok=excluded.input_price_per_mtok,"
                    "   output_price_per_mtok=excluded.output_price_per_mtok"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "project_id": project_id,
                    "model_name": model_name,
                    "input_price_per_mtok": input_price_per_mtok,
                    "output_price_per_mtok": output_price_per_mtok,
                    "created_at": _now(),
                },
            )
            row = conn.execute(
                text("SELECT * FROM custom_models WHERE project_id=:project_id AND model_name=:model_name"),
                {"project_id": project_id, "model_name": model_name},
            ).mappings().fetchone()
            return dict(row) if row else None
    except Exception as e:
        log.warning("tracing: failed to upsert custom model — %s", e)
        return None


def list_custom_models(project_id: str) -> list[dict]:
    _ensure_init()
    try:
        with get_engine().connect() as conn:
            rows = conn.execute(
                text("SELECT * FROM custom_models WHERE project_id=:project_id ORDER BY created_at DESC"),
                {"project_id": project_id},
            ).mappings().fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        log.warning("tracing: failed to list custom models — %s", e)
        return []


def delete_custom_model(project_id: str, model_name: str) -> None:
    try:
        with get_engine().begin() as conn:
            conn.execute(
                text("DELETE FROM custom_models WHERE project_id=:project_id AND model_name=:model_name"),
                {"project_id": project_id, "model_name": model_name},
            )
    except Exception as e:
        log.warning("tracing: failed to delete custom model — %s", e)


# ── Project-scoped API tokens ────────────────────────────────────────────

def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_token(project_id: str, name: str) -> dict | None:
    """Create a project-scoped token. Returns the row plus the raw token, which
    is shown to the user exactly once and never stored (only its hash is)."""
    _ensure_init()
    try:
        raw = "mni_" + secrets.token_urlsafe(24)
        token_id = str(uuid.uuid4())
        prefix = raw[:8]
        created_at = _now()
        with get_engine().begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO api_keys"
                    " (id, project_id, name, prefix, hashed_token, created_at)"
                    " VALUES (:id, :project_id, :name, :prefix, :hashed_token, :created_at)"
                ),
                {
                    "id": token_id,
                    "project_id": project_id,
                    "name": name,
                    "prefix": prefix,
                    "hashed_token": _hash_token(raw),
                    "created_at": created_at,
                },
            )
        return {
            "id": token_id,
            "project_id": project_id,
            "name": name,
            "prefix": prefix,
            "created_at": created_at,
            "last_used_at": None,
            "token": raw,
        }
    except Exception as e:
        log.warning("tracing: failed to create token — %s", e)
        return None


def list_tokens(project_id: str) -> list[dict]:
    """List tokens for a project. Never returns the hash or raw token."""
    _ensure_init()
    try:
        with get_engine().connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, project_id, name, prefix, created_at, last_used_at"
                    " FROM api_keys WHERE project_id=:project_id ORDER BY created_at DESC"
                ),
                {"project_id": project_id},
            ).mappings().fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        log.warning("tracing: failed to list tokens — %s", e)
        return []


def revoke_token(project_id: str, token_id: str) -> bool:
    try:
        with get_engine().begin() as conn:
            result = conn.execute(
                text("DELETE FROM api_keys WHERE id=:id AND project_id=:project_id"),
                {"id": token_id, "project_id": project_id},
            )
            return result.rowcount > 0
    except Exception as e:
        log.warning("tracing: failed to revoke token — %s", e)
        return False


def verify_token(raw: str) -> str | None:
    """Look up a raw token by its hash. On match, bump last_used_at and return
    the project_id it is scoped to. Returns None if unknown."""
    _ensure_init()
    try:
        with get_engine().begin() as conn:
            row = conn.execute(
                text("SELECT id, project_id FROM api_keys WHERE hashed_token=:h"),
                {"h": _hash_token(raw)},
            ).mappings().fetchone()
            if not row:
                return None
            conn.execute(
                text("UPDATE api_keys SET last_used_at=:now WHERE id=:id"),
                {"now": _now(), "id": row["id"]},
            )
            return row["project_id"]
    except Exception as e:
        log.warning("tracing: failed to verify token — %s", e)
        return None
