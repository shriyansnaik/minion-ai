---
title: init()
description: Process-wide configuration — credentials, endpoint, and where traces go.
sidebar:
  order: 2
---

```python
minions.init(
    api_key=None,
    base_url=None,
    tracing=False,
    project=None,
    db_path=None,
    trace_url=None,
    tracing_secret_token=None,
)
```

Call once, **before** creating any `Minion`. Configuration is process-wide.

## Arguments

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `api_key` | `str` | `None` | Sets one API key globally for LiteLLM. Omit it to use per-provider env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, …), which is what you want with more than one provider in a process. |
| `base_url` | `str` | `None` | Custom endpoint — Azure OpenAI, vLLM, any OpenAI-compatible API. |
| `tracing` | `bool` | `False` | Record runs, turns and tool calls. |
| `project` | `str` | `None` | Groups traces. **Required** when `tracing=True`. In remote mode it must match the project the token belongs to. |
| `db_path` | `str` | `None` | Override the local SQLite path. Local mode only. Default: `~/.minion/traces.db`. |
| `trace_url` | `str` | `None` | Push traces to a remote server instead of writing locally. |
| `tracing_secret_token` | `str` | `None` | Project-scoped `mni_…` token authenticating remote pushes. |

## Modes

**No tracing** (default) — no trace machinery runs, no file is created.

```python
minions.init(api_key="sk-...")
```

**Local** — a SQLite file on this machine. Read it with `minion serve`.

```python
minions.init(tracing=True, project="my-project")
```

**Remote** — pushed over HTTP to a server you run. Nothing is written locally.

```python
minions.init(
    tracing=True,
    project="my-project",
    trace_url="https://traces.mycompany.com",
    tracing_secret_token="mni_xK9mP2...",
)
```

See [Remote tracing](/deployment/remote-tracing/).

## Validation

`init()` raises `ValueError` immediately for a configuration that could never
work:

| Condition | Error |
| --- | --- |
| `tracing=True` without `project` | `project is required when tracing=True` |
| `tracing_secret_token` without `trace_url` | `tracing_secret_token requires trace_url` |
| `trace_url` without `tracing_secret_token` | `trace_url requires tracing_secret_token` |
| `trace_url` without `tracing=True` | `trace_url requires tracing=True` |

With `trace_url` set, `init()` also makes one verification request to the server
before returning:

- **Token invalid or revoked** → `ValueError`.
- **Token valid but scoped to a different project** → `ValueError`. The message
  deliberately does not reveal which project the token belongs to — a leaked
  token shouldn't double as a way to enumerate project names.
- **Server unreachable** → a warning is logged and `init()` **continues**. A
  down trace server must not stop your agent from starting.

This up-front check exists because the failure it catches is otherwise silent:
the server would reject every push with a 403, each rejection would only be
logged as a warning, and no trace would ever appear with nothing to explain why.

Everything *after* startup follows the opposite rule — see
[Tracing never breaks your agent](/guides/tracing/#tracing-never-breaks-your-agent).

## Environment variables

Read by the library or the server rather than passed to `init()`:

| Variable | Read by | Effect |
| --- | --- | --- |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, … | LiteLLM | Provider credentials, matched to the model string |
| `MINION_DB_PATH` | Server | SQLite path. Ignored when `DATABASE_URL` is set. Also what `minion serve --db-path` sets |
| `DATABASE_URL` | Server | `sqlite:///…` or `postgresql://…`. Takes priority over `MINION_DB_PATH` |

:::caution
LiteLLM matches provider env vars by exact name. `GROQ_API_KEY_1` will **not**
be picked up — it must be `GROQ_API_KEY`.
:::
