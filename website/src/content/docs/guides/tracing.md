---
title: Tracing & metadata
description: What Minion records, where it stores it, how to tag runs so you can find them again, and why tracing never breaks your agent.
sidebar:
  order: 4
---

```python
import minions

minions.init(tracing=True, project="my-project")
```

That's the whole setup. Every `agent(...)` call from then on records a run.
`project` is required when `tracing=True` — traces are always grouped under one.

`init()` must be called before you construct any `Minion`.

## What gets recorded

| Level | Fields |
| --- | --- |
| **Run** | id, created-at, model, status (`running` / `completed` / `failed`), system prompt, input, final output, tool names, tags, metadata, total input/output tokens, total latency, estimated cost, parent trace id |
| **Turn** | turn number, the model's thought, input/output tokens, latency, estimated cost |
| **Tool call** | tool name, arguments, result, latency |

Turns and tool calls are written as they happen, so a run you're watching
appears in the dashboard mid-flight with status `running`.

A failed run is recorded too, with the full formatted traceback on the run — the
exception still propagates out of `agent(...)` exactly as it would untraced.

### Sub-agent runs

Each sub-agent gets its own run row, carrying the parent's id in
`parent_trace_id`. In the dashboard the delegation tool call links straight into
the child run. The trace list shows only top-level runs, so a fan-out over 25
workers is one row, not 26.

Cost and token totals in the analytics view **include** sub-runs; run counts and
status breakdowns count only top-level runs. That combination is what you want:
"how many jobs did we do" and "what did they cost in total".

## Where it's stored

By default, a local SQLite file at `~/.minion/traces.db`
(`%USERPROFILE%\.minion\traces.db` on Windows).

```python
minions.init(tracing=True, project="my-project", db_path="./traces.db")
```

```bash
minion serve --db-path ./traces.db
```

For a shared team database, see [Remote tracing](/deployment/remote-tracing/).
For choosing between SQLite and Postgres, see
[Choosing a database](/deployment/choosing-a-database/).

## Tags and metadata

Both are per-call, passed at the call site rather than at construction:

```python
result = agent(
    "Refund order 8812",
    tags=["support", "beta"],
    metadata={"ticket_id": "T-4471", "user_id": "u_182", "prompt_version": "v3"},
)
```

- **`tags`** — a list of labels, shown on the trace detail page. Good for
  eyeballing; not filterable in the dashboard today.
- **`metadata`** — key/value pairs, **filterable** in the trace list, and
  chainable (`prompt_version=v3` AND `tier=pro`).

Metadata is what makes traces useful weeks later. Version your prompts in it and
you can pull up every run of `v3` and compare cost and success rate against
`v2`. Put your own request id in it and a customer complaint becomes a trace
lookup.

### How values are stored

Every metadata value is normalised to a **string** before storage, so filtering
is always an exact string comparison and never has to guess a type back out of a
query string (which is lossy for things like zero-padded ids).

| You pass | Stored as |
| --- | --- |
| `"v3"` | `"v3"` |
| `3`, `3.5`, `True` | `"3"`, `"3.5"`, `"True"` |
| `None` | the key is **dropped** — treated as "not set" |
| `{"a": 1}`, `[1, 2]` | JSON-encoded text: `'{"a": 1}'`, `'[1, 2]'` |

Nested values are stored and visible on the trace, but aren't practically
filterable — you'd have to type the exact serialised JSON into the filter box.
**Keep anything you want to filter on flat and scalar.**

```python
metadata={"ticket_id": "T-123"}                # filters cleanly
metadata={"context": {"ticket": "T-123"}}      # stored, but not filterable
```

## Tracing never breaks your agent

Every trace write is wrapped: if the database can't be opened, a table is
missing, or a remote server is unreachable, the write is skipped, a warning is
logged, and the run continues. `trace_id` comes back `None` and the agent still
returns its answer.

This is deliberate. Instrumentation that can take down the thing it measures is
worse than no instrumentation.

There is exactly one exception, and it's at startup: `init()` validates its own
arguments and raises immediately on a configuration that could never work — for
example a `trace_url` without a token, or a token that isn't scoped to the
project you named. Those fail *silently forever* otherwise: every push gets
rejected, every rejection is only a warning, and no trace ever appears with no
error to explain it.

## Turning it off

Omit `tracing=True` (the default) and no trace machinery runs at all — no file
is created, no database is touched. There is no separate "disable" call. To keep
one script untraced while others are traced, just don't call `init()` with
tracing in that script; configuration is per-process.

## Next

- **[Cost tracking](/guides/cost-tracking/)** — how the dollar figures are computed
- **[The dashboard](/guides/dashboard/)** — filtering, drill-down, analytics
