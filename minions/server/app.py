import base64
import json
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.engine import Connection as SAConnection

from .. import costs, trace_db

app = FastAPI(title="Minion Traces")


@app.on_event("startup")
def _startup():
    trace_db._ensure_init()


def _parse(row) -> dict:
    # On Postgres, `metadata` is JSONB and psycopg already deserializes it to
    # a dict/list; on SQLite it's still TEXT. The isinstance(str) guard is
    # what makes this function work across both dialects unchanged.
    d = dict(row)
    for field in ("tags", "metadata", "args", "tools"):
        if field in d and isinstance(d[field], str):
            try:
                d[field] = json.loads(d[field])
            except Exception:
                pass
    return d


def _load_custom_prices(conn: SAConnection, project_id: str | None) -> dict:
    """Custom prices are per-project. Without a project_id there is no project
    context, so only built-in pricing applies (empty custom map)."""
    if not project_id:
        return {}
    rows = conn.execute(
        text(
            "SELECT model_name, input_price_per_mtok, output_price_per_mtok"
            " FROM custom_models WHERE project_id=:project_id"
        ),
        {"project_id": project_id},
    ).mappings().fetchall()
    return {
        r["model_name"]: (r["input_price_per_mtok"] / 1e6, r["output_price_per_mtok"] / 1e6)
        for r in rows
    }


def _with_cost(run: dict, custom: dict = None) -> dict:
    model = run.get("model", "")
    itok = run.get("total_input_tokens") or 0
    otok = run.get("total_output_tokens") or 0
    if custom and model in custom:
        inp, out = custom[model]
        run["estimated_cost"] = itok * inp + otok * out
    else:
        run["estimated_cost"] = costs.estimate(model, itok, otok)
    return run


def _build_trace_filters(
    dialect_name: str,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    model: Optional[str] = None,
    search: Optional[str] = None,
    metadata_pairs: Optional[list[tuple[str, str]]] = None,
    created_after: Optional[str] = None,
    created_before: Optional[str] = None,
) -> tuple[list[str], dict]:
    """Shared WHERE-clause builder for list/count/bulk-delete-by-filter, so
    "what matches the current filter" can never drift between them.
    metadata_pairs is a list of (key, value) exact-match pairs, ANDed
    together — chaining multiple metadata filters."""
    clauses: list[str] = []
    params: dict = {}
    if project_id:
        clauses.append("project_id=:project_id")
        params["project_id"] = project_id
    if status:
        clauses.append("status=:status")
        params["status"] = status
    if model:
        clauses.append("model=:model")
        params["model"] = model
    if search:
        clauses.append("(input LIKE :search1 OR output LIKE :search2)")
        params["search1"] = params["search2"] = f"%{search}%"
    # Metadata values are stored as strings (see trace_db._stringify_metadata),
    # so this is always a plain string comparison on both dialects.
    pairs = [(k, v) for k, v in (metadata_pairs or []) if k]
    if pairs:
        if dialect_name == "postgresql":
            # A single containment check against a multi-key dict requires
            # every key to match — one GIN-indexed op covers the whole chain.
            clauses.append("metadata @> CAST(:metadata_filter AS jsonb)")
            params["metadata_filter"] = json.dumps(dict(pairs))
        else:
            for i, (k, v) in enumerate(pairs):
                clauses.append(f"json_extract(metadata, :metadata_path{i}) = :metadata_value{i}")
                params[f"metadata_path{i}"] = f"$.{k}"
                params[f"metadata_value{i}"] = v
    if created_after:
        clauses.append("created_at >= :created_after")
        params["created_after"] = created_after
    if created_before:
        clauses.append("created_at <= :created_before")
        params["created_before"] = created_before
    return clauses, params


_DELETE_BATCH_SIZE = 500


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _cascade_delete_runs(conn: SAConnection, run_ids: list[str]) -> int:
    """Delete tool_calls, turns, and runs for the given run ids, plus one
    level of their sub-traces (parent_trace_id matches a given id). IN
    clauses are chunked to stay under SQLite's bound-parameter ceiling when
    deleting large id sets (e.g. delete-all-matching-filter). Returns the
    number of run rows deleted."""
    if not run_ids:
        return 0
    all_ids = list(run_ids)
    for chunk in _chunks(run_ids, _DELETE_BATCH_SIZE):
        ph = ",".join(f":id{i}" for i in range(len(chunk)))
        params = {f"id{i}": v for i, v in enumerate(chunk)}
        sub_ids = [
            r["id"] for r in conn.execute(
                text(f"SELECT id FROM runs WHERE parent_trace_id IN ({ph})"), params
            ).mappings().fetchall()
        ]
        all_ids.extend(sub_ids)

    deleted = 0
    for chunk in _chunks(all_ids, _DELETE_BATCH_SIZE):
        ph = ",".join(f":id{i}" for i in range(len(chunk)))
        params = {f"id{i}": v for i, v in enumerate(chunk)}
        conn.execute(
            text(f"DELETE FROM tool_calls WHERE turn_id IN (SELECT id FROM turns WHERE trace_id IN ({ph}))"),
            params,
        )
        conn.execute(text(f"DELETE FROM turns WHERE trace_id IN ({ph})"), params)
        result = conn.execute(text(f"DELETE FROM runs WHERE id IN ({ph})"), params)
        deleted += result.rowcount
    return deleted


def _encode_cursor(created_at: str, run_id: str) -> str:
    return base64.urlsafe_b64encode(json.dumps({"created_at": created_at, "id": run_id}).encode()).decode()


def _decode_cursor(cursor: str) -> tuple[str, str]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        return data["created_at"], data["id"]
    except Exception:
        raise HTTPException(status_code=400, detail="invalid cursor")


class ProjectCreate(BaseModel):
    name: str


@app.get("/api/projects")
def list_projects():
    with trace_db.get_engine().connect() as conn:
        rows = conn.execute(text("""
            SELECT p.id, p.name, p.created_at,
                   COUNT(r.id) AS run_count,
                   MAX(r.created_at) AS last_run_at
            FROM projects p
            LEFT JOIN runs r ON r.project_id = p.id AND r.parent_trace_id IS NULL
            GROUP BY p.id
            ORDER BY last_run_at DESC NULLS LAST, p.created_at DESC
        """)).mappings().fetchall()
    return [dict(r) for r in rows]


@app.post("/api/projects", status_code=201)
def create_project(body: ProjectCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    project_id = trace_db.ensure_project(name)
    if not project_id:
        raise HTTPException(status_code=500, detail="failed to create project")
    with trace_db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT * FROM projects WHERE id=:id"), {"id": project_id}
        ).mappings().fetchone()
    return dict(row)


@app.get("/api/traces")
def list_traces(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    metadata_key: list[str] = Query([]),
    metadata_value: list[str] = Query([]),
    created_after: Optional[str] = Query(None),
    created_before: Optional[str] = Query(None),
    sort: str = Query("desc", pattern="^(asc|desc)$"),
    cursor: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
):
    with trace_db.get_engine().connect() as conn:
        clauses, params = _build_trace_filters(
            conn.dialect.name, project_id, status, model, search,
            list(zip(metadata_key, metadata_value)), created_after, created_before,
        )
        sql = "SELECT * FROM runs WHERE parent_trace_id IS NULL"
        for c in clauses:
            sql += f" AND {c}"

        cmp_op = "<" if sort == "desc" else ">"
        if cursor:
            cursor_created, cursor_id = _decode_cursor(cursor)
            sql += (
                f" AND (created_at {cmp_op} :cursor_created"
                f" OR (created_at = :cursor_created AND id {cmp_op} :cursor_id))"
            )
            params["cursor_created"] = cursor_created
            params["cursor_id"] = cursor_id

        order = "DESC" if sort == "desc" else "ASC"
        sql += f" ORDER BY created_at {order}, id {order} LIMIT :limit"
        # Fetch one extra row to know whether a next page exists, without
        # relying on offset-based counting (which doesn't scale, and isn't
        # needed for keyset pagination anyway).
        params["limit"] = limit + 1

        custom = _load_custom_prices(conn, project_id)
        rows = conn.execute(text(sql), params).mappings().fetchall()

    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [_with_cost(_parse(r), custom) for r in rows]
    next_cursor = _encode_cursor(items[-1]["created_at"], items[-1]["id"]) if has_more and items else None
    return {"items": items, "next_cursor": next_cursor}


@app.get("/api/traces/count")
def count_traces(
    project_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    metadata_key: list[str] = Query([]),
    metadata_value: list[str] = Query([]),
    created_after: Optional[str] = Query(None),
    created_before: Optional[str] = Query(None),
):
    with trace_db.get_engine().connect() as conn:
        clauses, params = _build_trace_filters(
            conn.dialect.name, project_id, status, model, search,
            list(zip(metadata_key, metadata_value)), created_after, created_before,
        )
        sql = "SELECT COUNT(*) FROM runs WHERE parent_trace_id IS NULL"
        for c in clauses:
            sql += f" AND {c}"
        n = conn.execute(text(sql), params).scalar()
    return {"count": n}


def _build_trace(conn: SAConnection, trace_id: str, custom: dict = None) -> dict | None:
    row = conn.execute(
        text("SELECT * FROM runs WHERE id=:id"), {"id": trace_id}
    ).mappings().fetchone()
    if not row:
        return None

    run = _with_cost(_parse(row), custom)

    turns = conn.execute(
        text("SELECT * FROM turns WHERE trace_id=:trace_id ORDER BY turn_number"),
        {"trace_id": trace_id},
    ).mappings().fetchall()
    turn_list = []
    for t in turns:
        td = _parse(t)
        tcs = conn.execute(
            text("SELECT * FROM tool_calls WHERE turn_id=:turn_id ORDER BY seq"),
            {"turn_id": td["id"]},
        ).mappings().fetchall()
        td["tool_calls"] = [_parse(tc) for tc in tcs]
        turn_list.append(td)
    run["turns"] = turn_list

    sub_ids = conn.execute(
        text("SELECT id FROM runs WHERE parent_trace_id=:trace_id ORDER BY created_at"),
        {"trace_id": trace_id},
    ).mappings().fetchall()
    run["sub_traces"] = [_build_trace(conn, r["id"], custom) for r in sub_ids]

    # Link each sub-minion tool call to the sub-trace it produced so the UI can
    # offer an inline "open trace" jump. Both the generic `_spawn_sub_minion`
    # and named specialist sub-minions run the child with input == the tool
    # call's `input` arg, so match on that. Only the generic spawn can collide
    # on input (e.g. fan-out with identical inputs), so its creation-order
    # fallback stays scoped to `_spawn_sub_minion`.
    available = [s for s in run["sub_traces"] if s]
    used: set[str] = set()
    for turn in turn_list:
        for tc in turn.get("tool_calls", []):
            args = tc.get("args") if isinstance(tc.get("args"), dict) else {}
            want = args.get("input")
            match = next(
                (s for s in available if s["id"] not in used and want is not None and s.get("input") == want),
                None,
            )
            if match is None and tc.get("tool_name") == "_spawn_sub_minion":
                match = next((s for s in available if s["id"] not in used), None)
            if match is not None:
                used.add(match["id"])
                tc["sub_trace_id"] = match["id"]
                tc["sub_status"] = match.get("status")

    return run


class CustomModelCreate(BaseModel):
    project_id: str
    model_name: str
    input_price_per_mtok: float
    output_price_per_mtok: float


@app.get("/api/models")
def list_models(project_id: str = Query(...)):
    return {
        "builtin": costs.list_builtin(),
        "custom": trace_db.list_custom_models(project_id),
    }


@app.post("/api/models/custom", status_code=201)
def create_custom_model(body: CustomModelCreate):
    name = body.model_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="model_name required")
    if not body.project_id:
        raise HTTPException(status_code=400, detail="project_id required")
    result = trace_db.upsert_custom_model(
        body.project_id, name, body.input_price_per_mtok, body.output_price_per_mtok
    )
    if not result:
        raise HTTPException(status_code=500, detail="failed to save model")
    return result


@app.delete("/api/models/custom")
def delete_custom_model(model_name: str = Query(...), project_id: str = Query(...)):
    # model_name is a query param (not a path segment) because model names
    # commonly contain slashes, e.g. "openai/gpt-5".
    trace_db.delete_custom_model(project_id, model_name)
    return {"ok": True}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    with trace_db.get_engine().begin() as conn:
        top_ids = [
            r["id"] for r in conn.execute(
                text("SELECT id FROM runs WHERE project_id=:project_id"),
                {"project_id": project_id},
            ).mappings().fetchall()
        ]
        _cascade_delete_runs(conn, top_ids)
        conn.execute(
            text("DELETE FROM projects WHERE id=:project_id"), {"project_id": project_id}
        )
    return {"ok": True}


@app.delete("/api/traces/{trace_id}")
def delete_trace(trace_id: str):
    with trace_db.get_engine().begin() as conn:
        _cascade_delete_runs(conn, [trace_id])
    return {"ok": True}


class BulkDeleteIds(BaseModel):
    ids: list[str]


@app.post("/api/traces/bulk-delete")
def bulk_delete_traces(body: BulkDeleteIds):
    if not body.ids:
        raise HTTPException(status_code=400, detail="ids required")
    with trace_db.get_engine().begin() as conn:
        deleted = _cascade_delete_runs(conn, body.ids)
    return {"ok": True, "deleted": deleted}


class BulkDeleteFilter(BaseModel):
    project_id: Optional[str] = None
    status: Optional[str] = None
    model: Optional[str] = None
    search: Optional[str] = None
    metadata_key: list[str] = []
    metadata_value: list[str] = []
    created_after: Optional[str] = None
    created_before: Optional[str] = None


@app.post("/api/traces/bulk-delete-by-filter")
def bulk_delete_traces_by_filter(body: BulkDeleteFilter):
    with trace_db.get_engine().begin() as conn:
        clauses, params = _build_trace_filters(
            conn.dialect.name, body.project_id, body.status, body.model, body.search,
            list(zip(body.metadata_key, body.metadata_value)), body.created_after, body.created_before,
        )
        sql = "SELECT id FROM runs WHERE parent_trace_id IS NULL"
        for c in clauses:
            sql += f" AND {c}"
        ids = [r["id"] for r in conn.execute(text(sql), params).mappings().fetchall()]
        deleted = _cascade_delete_runs(conn, ids)
    return {"ok": True, "deleted": deleted}


@app.get("/api/analytics")
def analytics(project_id: Optional[str] = Query(None)):
    """Aggregate spend / token / latency metrics for a project.

    Spend and token totals include sub-minion runs; the run count and
    status breakdown reflect only top-level traces (what the list shows).
    """
    with trace_db.get_engine().connect() as conn:
        custom = _load_custom_prices(conn, project_id)
        sql = "SELECT * FROM runs"
        params: dict = {}
        if project_id:
            sql += " WHERE project_id=:project_id"
            params["project_id"] = project_id
        rows = [
            _with_cost(_parse(r), custom)
            for r in conn.execute(text(sql), params).mappings().fetchall()
        ]

    top = [r for r in rows if not r.get("parent_trace_id")]

    total_cost = sum(r.get("estimated_cost") or 0 for r in rows)
    total_in = sum(r.get("total_input_tokens") or 0 for r in rows)
    total_out = sum(r.get("total_output_tokens") or 0 for r in rows)
    finished = [r for r in top if r.get("status") in ("completed", "failed")]
    completed = [r for r in top if r.get("status") == "completed"]
    latencies = [r.get("total_latency_ms") or 0 for r in completed if r.get("total_latency_ms")]

    summary = {
        "runs": len(top),
        "sub_runs": len(rows) - len(top),
        "cost": total_cost,
        "input_tokens": total_in,
        "output_tokens": total_out,
        "tokens": total_in + total_out,
        "avg_latency_ms": (sum(latencies) / len(latencies)) if latencies else 0,
        "success_rate": (len(completed) / len(finished)) if finished else None,
        "completed": len(completed),
        "failed": sum(1 for r in top if r.get("status") == "failed"),
        "running": sum(1 for r in top if r.get("status") == "running"),
        "has_unpriced": any(r.get("estimated_cost") is None for r in rows),
    }

    daily: dict[str, dict] = {}
    for r in rows:
        day = (r.get("created_at") or "")[:10]
        if not day:
            continue
        d = daily.setdefault(day, {"date": day, "runs": 0, "cost": 0.0, "input_tokens": 0, "output_tokens": 0})
        if not r.get("parent_trace_id"):
            d["runs"] += 1
        d["cost"] += r.get("estimated_cost") or 0
        d["input_tokens"] += r.get("total_input_tokens") or 0
        d["output_tokens"] += r.get("total_output_tokens") or 0

    by_model: dict[str, dict] = {}
    for r in rows:
        model = r.get("model") or "unknown"
        m = by_model.setdefault(
            model,
            {"model": model, "runs": 0, "cost": 0.0, "input_tokens": 0, "output_tokens": 0, "_lat": []},
        )
        m["runs"] += 1
        m["cost"] += r.get("estimated_cost") or 0
        m["input_tokens"] += r.get("total_input_tokens") or 0
        m["output_tokens"] += r.get("total_output_tokens") or 0
        if r.get("status") == "completed" and r.get("total_latency_ms"):
            m["_lat"].append(r["total_latency_ms"])
    model_list = []
    for m in by_model.values():
        lat = m.pop("_lat")
        m["avg_latency_ms"] = (sum(lat) / len(lat)) if lat else 0
        m["tokens"] = m["input_tokens"] + m["output_tokens"]
        model_list.append(m)
    model_list.sort(key=lambda m: m["cost"], reverse=True)

    return {
        "summary": summary,
        "daily": [daily[k] for k in sorted(daily)],
        "by_model": model_list,
    }


@app.get("/api/traces/{trace_id}")
def get_trace(trace_id: str):
    with trace_db.get_engine().connect() as conn:
        owner = conn.execute(
            text("SELECT project_id FROM runs WHERE id=:id"), {"id": trace_id}
        ).mappings().fetchone()
        custom = _load_custom_prices(conn, owner["project_id"] if owner else None)
        result = _build_trace(conn, trace_id, custom)
    if not result:
        return JSONResponse(status_code=404, content={"detail": "not found"})
    return result


# ── Project-scoped API tokens ────────────────────────────────────────────

class TokenCreate(BaseModel):
    name: str


def _project_name(conn: SAConnection, project_id: str) -> str | None:
    row = conn.execute(
        text("SELECT name FROM projects WHERE id=:id"), {"id": project_id}
    ).mappings().fetchone()
    return row["name"] if row else None


@app.get("/api/projects/{project_id}/tokens")
def list_tokens(project_id: str):
    return trace_db.list_tokens(project_id)


@app.post("/api/projects/{project_id}/tokens", status_code=201)
def create_token(project_id: str, body: TokenCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    with trace_db.get_engine().connect() as conn:
        if _project_name(conn, project_id) is None:
            raise HTTPException(status_code=404, detail="project not found")
    result = trace_db.create_token(project_id, name)
    if not result:
        raise HTTPException(status_code=500, detail="failed to create token")
    return result


@app.delete("/api/projects/{project_id}/tokens/{token_id}")
def revoke_token(project_id: str, token_id: str):
    if not trace_db.revoke_token(project_id, token_id):
        raise HTTPException(status_code=404, detail="token not found")
    return {"ok": True}


# ── Trace ingest (remote push from minion-ai clients) ─────────────────────

def require_token(x_minion_token: str | None = Header(None)) -> str:
    """Authenticate an ingest request via the X-Minion-Token header.
    Returns the project_id the token is scoped to, or raises 401."""
    if not x_minion_token:
        raise HTTPException(status_code=401, detail="missing X-Minion-Token header")
    project_id = trace_db.verify_token(x_minion_token)
    if not project_id:
        raise HTTPException(status_code=401, detail="invalid token")
    return project_id


def _check_project(project_id: str, project_name: str) -> None:
    """Ensure the project name the client sent matches the token's project."""
    with trace_db.get_engine().connect() as conn:
        actual = _project_name(conn, project_id)
    if actual is None:
        raise HTTPException(status_code=404, detail="project not found")
    if project_name != actual:
        raise HTTPException(
            status_code=403,
            detail=f"token is not scoped to project '{project_name}'",
        )


@app.get("/api/ingest/verify")
def verify_project(project: str = Query(...), project_id: str = Depends(require_token)):
    """Health check used by minions.init() to confirm a token actually matches
    the project name passed to init(), before any traces are pushed. Doesn't
    reveal the token's actual project — just whether it matches `project`."""
    with trace_db.get_engine().connect() as conn:
        actual = _project_name(conn, project_id)
    return {"match": actual == project}


class IngestRun(BaseModel):
    project: str
    run_id: str
    model: str
    input: str
    created_at: Optional[str] = None
    status: Optional[str] = None
    system_prompt: Optional[str] = None
    parent_trace_id: Optional[str] = None
    tags: Optional[list] = None
    metadata: Optional[dict] = None
    tools: Optional[list] = None


class IngestRunFinish(BaseModel):
    status: str
    output: Optional[str] = None
    error: Optional[str] = None
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_latency_ms: int = 0


class IngestTurn(BaseModel):
    turn_number: int
    thought: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    tool_calls: list = []


@app.post("/api/ingest/runs", status_code=201)
def ingest_run(body: IngestRun, project_id: str = Depends(require_token)):
    _check_project(project_id, body.project)
    trace_id = trace_db.create_run(
        model=body.model,
        input=body.input,
        parent_trace_id=body.parent_trace_id,
        project_id=project_id,
        tags=body.tags,
        metadata=body.metadata,
        system_prompt=body.system_prompt,
        tools=body.tools,
        trace_id=body.run_id,
        created_at=body.created_at,
    )
    if not trace_id:
        raise HTTPException(status_code=500, detail="failed to write run")
    return {"run_id": trace_id}


@app.patch("/api/ingest/runs/{run_id}")
def ingest_run_finish(run_id: str, body: IngestRunFinish, project_id: str = Depends(require_token)):
    if body.status == "failed":
        trace_db.fail_run(run_id, error=body.error)
    else:
        trace_db.finish_run(
            run_id,
            output=body.output or "",
            total_input_tokens=body.total_input_tokens,
            total_output_tokens=body.total_output_tokens,
            total_latency_ms=body.total_latency_ms,
        )
    return {"ok": True}


@app.post("/api/ingest/runs/{run_id}/turns", status_code=201)
def ingest_turn(run_id: str, body: IngestTurn, project_id: str = Depends(require_token)):
    trace_db.append_turn(
        trace_id=run_id,
        turn_number=body.turn_number,
        thought=body.thought,
        input_tokens=body.input_tokens,
        output_tokens=body.output_tokens,
        latency_ms=body.latency_ms,
        tool_calls=body.tool_calls,
    )
    return {"ok": True}


_ui_dir = Path(__file__).parent / "ui" / "dist"
if _ui_dir.exists():
    app.mount("/", StaticFiles(directory=str(_ui_dir), html=True), name="ui")

    # StaticFiles(html=True) only serves index.html for "/" and real
    # directories — it 404s on deep client-side routes like
    # /project/<id>/trace/<id> since no such file/directory exists. Fall
    # back to index.html for any non-API 404 so client-side routing works.
    @app.exception_handler(404)
    async def _spa_fallback(request, exc):
        if request.url.path.startswith("/api"):
            return JSONResponse(status_code=404, content={"detail": getattr(exc, "detail", "Not Found")})
        return FileResponse(str(_ui_dir / "index.html"))
