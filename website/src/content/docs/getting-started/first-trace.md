---
title: Your first trace
description: Turn on tracing, run the agent, and read the result in the dashboard.
sidebar:
  order: 4
---

Tracing is one flag. Add two lines to the agent from the previous page:

```python ins={6-9}
# first_agent.py
import minions

# ... your tool functions, unchanged ...

minions.init(
    tracing=True,
    project="tutorial",   # required whenever tracing=True
)

agent = minions.Minion(
    model="openai/gpt-4o",
    tools=[get_weather, get_population],
)

result = agent("Compare Oslo and Lisbon for a weekend trip this week.")
print(result.trace_id)
```

`init()` must be called **before** you create any `Minion`. Run the program
again, then:

```bash
minion serve
```

Open <http://localhost:7337> and pick the **tutorial** project.

## Where the data went

By default, traces are written to a SQLite file at `~/.minion/traces.db`
(`%USERPROFILE%\.minion\traces.db` on Windows). Nothing is sent anywhere. Point
it somewhere else with `db_path`:

```python
minions.init(tracing=True, project="tutorial", db_path="./traces.db")
```

and read that file with `minion serve --db-path ./traces.db`.

To push traces to a shared server instead of a local file, see
[Remote tracing](/deployment/remote-tracing/).

## What a trace contains

One **run** per `agent(...)` call, holding:

| | |
| --- | --- |
| **Run** | Input, final output, status, model, system prompt, tool names, tags, metadata, total tokens, total latency, estimated cost |
| **Turn** | Turn number, the model's thought, input/output tokens, latency, estimated cost |
| **Tool call** | Tool name, arguments, result, and its own latency |

Sub-agent runs are recorded as their own runs, linked to the parent — so a
delegating agent shows up as a tree you can click into, not a flattened log.

## Reading it

Open the run and you'll see the turns in order. Each turn shows the thought that
produced it and the tool calls it made, with the arguments passed and what came
back. That is usually enough to answer the two questions you actually have:

- **Why did it do that?** — read the thought immediately before the surprising
  tool call.
- **Why is it slow / expensive?** — the per-turn latency and cost show which
  turn is the problem, and per-tool latency shows whether it's the model or your
  tool.

## Tag runs so you can find them later

`metadata` attaches arbitrary key/value pairs to a run, and the dashboard can
filter on them:

```python
result = agent(
    "Compare Oslo and Lisbon…",
    metadata={"user_id": "u_182", "experiment": "prompt-v3"},
    tags=["tutorial"],
)
```

Then filter the trace list by `experiment=prompt-v3` to compare a change against
its baseline. Metadata is stored as a flat string→string map; see
[Tracing & metadata](/guides/tracing/) for exactly how values are converted and
which ones stay filterable.

## Tracing never breaks your agent

If the trace store is unwritable, or a remote trace server is down, the write is
skipped and a warning is logged — the agent keeps running and still returns its
answer. Tracing is instrumentation, and instrumentation that can take down the
thing it measures is worse than none.

The one exception is deliberate: `init()` validates its own arguments up front
and raises immediately on an impossible configuration (for example a remote
token that isn't scoped to the project you named), because that fails silently
forever otherwise.

## Next

- **[Tools](/guides/tools/)** — everything a tool function can do
- **[The dashboard](/guides/dashboard/)** — filters, analytics, and model prices
- **[Cookbook](/cookbook/)** — complete programs to copy
