---
title: Sub-agents & specialists
description: Two ways to delegate — ad-hoc workers for fan-out, and named specialists for a fixed team — and how they compose.
sidebar:
  order: 2
---

A single `Minion` is one agent with tools. Real work often needs a team. Minion
gives you two ways to delegate, and they mix freely.

| Style | How you enable it | Use it for |
| --- | --- | --- |
| **Ad-hoc workers** | `allow_sub_agents=True` | Fan-out over many similar items — read 100 files across 25 workers |
| **Named specialists** | `sub_minions=[researcher, writer]` | A fixed team of experts the manager routes between |

## Ad-hoc workers

Setting `allow_sub_agents=True` gives the agent a `_spawn_sub_minion` tool. The
model decides when to use it; the system prompt tells it to delegate whenever a
task involves three or more independent items, and to split them evenly.

```python
agent = minions.Minion(
    model="openai/gpt-4o",
    tools=[read_file, list_files],
    allow_sub_agents=True,
    secondary_model="openai/gpt-4o-mini",   # workers run on the cheap model
)

agent("Summarise every file in the /reports directory")
```

The manager lists the directory, then spawns workers with a few files each,
reads their summaries, and writes the final answer. It does not read the files
itself — that's the point. Twelve files through one agent means twelve file
bodies in the context window by the last turn; twelve files across three workers
means the manager only ever sees three summaries.

### `secondary_model`

Workers do narrow, well-specified work, which is exactly where a smaller model
holds up. `secondary_model` is where most of the cost saving in a delegating
agent comes from.

If you set `allow_sub_agents=True` without a `secondary_model`, workers inherit
the main model and Minion prints a notice saying so. Same for
`secondary_model_reasoning_effort`, which falls back to `reasoning_effort`.

### Restricting a worker's tools

The model can pass `tool_list` when spawning a worker to give it only some of
the parent's tools:

```
_spawn_sub_minion(
    input="Summarise these four files: ...",
    tool_list=["read_file"],       # no write access
)
```

Omit `tool_list` and the worker inherits all of the parent's tools. You can't
force this from Python today — it's a decision the model makes — so if a tool
must never be reachable from a worker, don't give it to the parent either.

## Named specialists

A minion becomes a specialist the moment you give it a `name` and a
`description`, and pass it into another minion's `sub_minions`:

```python
researcher = minions.Minion(
    name="researcher",
    description="Researches a topic; returns findings with sources.",
    model="openai/gpt-4o",
    tools=[search, extract],
    system_prompt=(
        "You are a meticulous researcher. Research the given topic using the "
        "search and extract tools. Do not use your own knowledge."
    ),
)

writer = minions.Minion(
    name="writer",
    description="Drafts a short markdown article from research notes.",
    model="openai/gpt-4o",
    system_prompt="Draft a concise, well-structured markdown article from the input.",
)

editor = minions.Minion(
    model="openai/gpt-4o",
    sub_minions=[researcher, writer],
    system_prompt=(
        "You manage an editorial team. Use the researcher to gather facts and "
        "the writer to turn them into an article. Publish the writer's draft "
        "as-is; do not rephrase it."
    ),
)

print(editor("Write an appreciation piece on this year's IPL final."))
```

`name` and `description` are **required** for anything in `sub_minions` —
Minion raises a `ValueError` otherwise, as it does for two specialists sharing a
name. The name is how the manager calls it; the description is how the manager's
model decides *when* to. Write the description as one line about what the
specialist does, not what it is.

### Why specialists are cheap

The manager's prompt contains only each specialist's **name, description, and a
single `input` argument** — never the specialist's own system prompt or tool
schemas. A researcher with fifteen tools costs the manager one line.

Each specialist then runs its own independent loop with its own prompt, tools,
model and `max_turns`, and returns only its final answer.

### Specialists have no memory

A specialist is called with one `input` string and knows nothing about the
manager's conversation. The `input` must be self-contained — the schema
description says so explicitly, and managers generally comply, but a manager
that writes terse inputs is a `system_prompt` problem worth fixing:

```python
editor = minions.Minion(
    ...,
    system_prompt=(
        "... When delegating, restate all necessary context in the input; "
        "specialists cannot see this conversation."
    ),
)
```

## Reading a team run

Every turn is printed with the minion that produced it, so hand-offs are visible
in the console:

```
===== openai/gpt-4o =====          ← the manager
Thought: 'I will first ask the researcher to gather accurate information...'
Tool_1: 'researcher'
Args: input='Research and provide verified details on...'

===== researcher =====             ← the researcher, running its own loop
Thought: 'I should search for up-to-date information first.'
Tool_1: 'search'   Args: query='IPL final result'
Tool_2: 'search'   Args: query='IPL final man of the match'

===== researcher =====
Tool_1: '_finish'
Args: final_response='The final concluded with...'

===== openai/gpt-4o =====          ← back in the manager
Tool_1: 'writer'
Args: input='Write a short appreciation article...'
```

Each `=====` header is a different minion's turn. A `_finish` under `researcher`
ends the *researcher's* run and hands its answer back — every minion runs its
own loop and calls `_finish` exactly once.

In the dashboard the same structure appears as a tree: each delegation tool call
carries an **Open trace ↗** link into that sub-run, with its own turns, tokens
and cost. The nesting is recursive.

## How they compose

All four combinations work, and the trace tree links up correctly in each:

- **Worker → specialist.** A spawned worker automatically inherits the manager's
  specialists, so it can call `researcher` too. It cannot spawn further workers
  (`allow_sub_agents` is forced off one level down), which bounds recursion.
- **Specialist → specialist.** Give a specialist its own `sub_minions=[…]`. It's
  an ordinary `Minion`; nothing special is needed.
- **Specialist → worker.** Give a specialist `allow_sub_agents=True`.
- **Both at once.** `sub_minions=[…]` and `allow_sub_agents=True` on the same
  minion, as in the guide above.

Workers also inherit the parent's `parallel_tools` setting, so a parallel manager
delegates to parallel workers.

## Concurrency

A `Minion` holds only immutable configuration — all per-run state lives in a
throwaway object created inside `__call__`. So the *same* minion instance can be
run concurrently:

```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor() as pool:
    results = list(pool.map(researcher, ["topic A", "topic B", "topic C"]))
```

Each call gets its own isolated run and its own trace. Your **tools** still have
to be thread-safe — see [Tools § Thread safety](/guides/tools/#thread-safety).

## Cheat sheet

| You want | Do this |
| --- | --- |
| A fixed team of named experts | `sub_minions=[…]` (each needs `name` + `description`) |
| Ad-hoc fan-out over many items | `allow_sub_agents=True` |
| Both | Use them together |
| Cheaper ad-hoc workers | `secondary_model="…"` |
| A turn's tool calls to run at once | `parallel_tools=True` (tools must be thread-safe) |
| The run's handle for the dashboard | `result.trace_id` |
