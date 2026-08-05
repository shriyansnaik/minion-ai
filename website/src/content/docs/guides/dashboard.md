---
title: The dashboard
description: Run the trace viewer, filter down to the run you care about, read a trace, and roll spend up by day or model.
sidebar:
  order: 6
---

```bash
minion serve
```

Opens the dashboard on <http://localhost:7337>, reading the local trace database
(`~/.minion/traces.db` by default).

```bash
minion serve --port 8080 --db-path ./traces.db
```

The same server, containerised, is what a team points its agents at — see
[Self-hosting](/deployment/self-hosting/). Everything on this page applies to
both.

## Projects

Every trace belongs to the `project` you passed to `init()`. The project
switcher scopes the whole dashboard: the trace list, analytics, model prices,
and API tokens are all per-project.

Use projects as hard boundaries — one per application, or one per environment
(`checkout-prod`, `checkout-dev`). They're not tags; you can't view across two at
once, and custom model prices don't cross between them.

## The trace list

One row per **top-level** run. Sub-agent runs are not listed separately — they
appear nested inside their parent's trace — so a fan-out over 25 workers is one
row.

Rows are keyset-paginated and sortable oldest- or newest-first. Keyset paging
means page 40 costs the same as page 1, which matters once a project has real
volume.

### Filters

| Filter | Match |
| --- | --- |
| **Status** | Exact — `running`, `completed`, `failed` |
| **Model** | Exact model string |
| **Search** | Substring of the run's **input or output** |
| **Metadata** `key=value` | Exact match on a stored metadata value. Chainable — several pairs are ANDed |
| **Date range** | From/to on the run's creation time |

Filters combine, and the URL is path-style and shareable
(`/project/<id>/trace/<id>`), so a link to a specific run drops a colleague
exactly where you were.

Metadata filtering is the one worth building a habit around. Put a prompt
version, an experiment name, or your own request id in
[`metadata`](/guides/tracing/#tags-and-metadata) at call time, and the trace
list becomes queryable after the fact:

```python
agent(task, metadata={"prompt_version": "v3", "tier": "pro"})
```

Values are compared as exact strings — see
[how metadata values are stored](/guides/tracing/#how-values-are-stored) for why
nested values won't filter.

## Reading a trace

The detail view lays a run out as **run → turns → tool calls**:

- **Run header** — status, model, total tokens, total latency, estimated cost,
  tags and metadata.
- **Each turn** — the model's thought, its tokens, its latency, and its share of
  the cost. Turn costs sum to the run total.
- **Each tool call** — arguments in, result out, and its own latency.

Two questions this answers directly:

- **Why did it do that?** Read the thought immediately above the surprising tool
  call. The thought is the model's stated intent for that turn.
- **Why was it slow or expensive?** Turn latency and cost isolate the turn;
  per-tool latency then tells you whether the model or your tool was the holdup.
  Under [`parallel_tools`](/guides/parallel-tools/), tool latencies overlap and
  deliberately don't sum to the turn — the turn is as slow as its slowest tool.

### Sub-agent runs

A delegation tool call (`_spawn_sub_minion`, or a specialist by name) carries an
**Open trace ↗** link into that sub-run — its own turns, tokens and cost. The
nesting is recursive, so a specialist that delegates further keeps going deeper.

### Failed runs

A failed run keeps everything recorded up to the failure, plus the full
traceback on the run. The last turn before the error is usually the whole story.

## Analytics

Per project: total spend, tokens, average latency, success rate, a daily
rollup, and a breakdown by model.

Two counting rules, applied consistently:

- **Spend and tokens include sub-agent runs.** What the work actually cost.
- **Run counts, status breakdown and success rate cover top-level runs only.**
  What the list shows, and what "a job" means.

If any run in scope is unpriced, the view says so rather than quietly
under-reporting. See [Cost tracking](/guides/cost-tracking/#unpriced-runs).

## Settings

Per project, behind the ⚙️ gear:

- **Model Prices** — add or override a model's input/output price per million
  tokens. Applies retroactively, since cost is computed at read time.
- **API Tokens** — create project-scoped `mni_…` tokens for agents pushing to
  this server remotely. A token is shown **once**, at creation; only its hash is
  stored. See [Remote tracing](/deployment/remote-tracing/).

## Deleting

- A single trace, from its detail view.
- Selected rows in the list.
- **Everything matching the current filter** — the destructive one, and the
  reason the delete dialog states the exact count first. It uses the same filter
  builder as the list, so what it deletes is what you were looking at.
- A whole project, which takes its traces with it.

Deletes cascade to a run's turns and tool calls, and to its **immediate**
sub-agent runs. Deeper nesting is not followed today — a specialist that itself
delegated leaves its grandchild runs behind: invisible in the trace list (which
shows only top-level runs) but still counted in analytics.

:::caution
There is no undo and no soft delete. On a shared server, everyone with dashboard
access can delete — read/dashboard endpoints are unauthenticated today (only
trace *ingest* requires a token), so put a shared deployment behind your own
auth or a private network. Tracked in the roadmap.
:::

## Developing the dashboard

The React source lives in `ui/` and the server ships a pre-built bundle, so
`minion serve` alone needs no Node toolchain. To work on the UI:

```bash
minion serve            # terminal 1 — API on :7337
cd ui && npm run dev    # terminal 2 — Vite on :5173, proxies /api to 7337
```

Use **:5173** for hot reload. After editing, `npm run build` — otherwise the
change won't appear under `minion serve`.
