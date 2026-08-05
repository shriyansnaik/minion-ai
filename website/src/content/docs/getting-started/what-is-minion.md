---
title: What is Minion?
description: A small Python framework for agents that think, use tools, and delegate — with tracing, cost and a dashboard built in.
sidebar:
  order: 1
---

Minion is a Python library for building AI agents. An agent, here, is a loop:

1. The model **thinks** about the task and picks tools to call.
2. Minion **runs** those tools.
3. The results go back into the conversation, and the loop repeats.
4. The model calls `_finish` when it has an answer.

That's the whole model. There is no graph to declare, no state machine, no DSL.
You write Python functions, hand them to a `Minion`, and call it.

```python
import minions

def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: Name of the city.
    """
    return f"{city}: 22°C, clear"

agent = minions.Minion(model="openai/gpt-4o", tools=[get_weather])
print(agent("Should I take a jacket in Oslo today?"))
```

## What makes it different

**Tools are ordinary functions.** The signature and the docstring *are* the
schema. There is nothing to keep in sync, because there is only one definition.

**Observability is one flag.** `minions.init(tracing=True, project="…")` records
every run, turn, tool call, token and estimated dollar to a local SQLite file.
`minion serve` opens a dashboard over it. No account, no SaaS, no data leaving
your machine unless you point it at a server you run.

**Delegation is first-class, in two flavours.** Ad-hoc workers for fan-out
(`allow_sub_agents=True`), and named specialists you compose yourself
(`sub_minions=[…]`). Sub-agent traces nest under the parent, so a five-agent run
still reads as one tree.

**It is honest about models.** Minion demands a strict JSON envelope every turn,
which means it works with models whose provider supports native JSON-schema
structured output, and genuinely does not work with the ones that don't. That
constraint is documented as [three explicit tiers](/reference/providers/) rather
than hidden behind "works with any provider".

## What it is not

- **Not a workflow engine.** If you need durable, resumable, multi-day
  orchestration with retries and checkpoints, Minion is the wrong shape.
- **Not a hosted platform.** The dashboard is a container you run. There is no
  Minion cloud.
- **Not batteries-included for RAG.** There is no bundled vector store, chunker,
  or retriever. Write a `search()` function and pass it as a tool.

## The two pieces

| Piece | What it is | How you get it |
| --- | --- | --- |
| `minion-ai` | The agent library your code imports | `pip install minion-ai` |
| `minion-server` | The dashboard that stores and displays traces | Bundled — `minion serve` — or run as a container for a team |

For a single developer, both live on your laptop and you never think about the
split. For a team, one server collects traces from everyone's agents. Same
library either way; see [Remote tracing](/deployment/remote-tracing/).

## Where to go next

- **[Installation](/getting-started/installation/)** — install, and pick a model
  that works.
- **[Your first agent](/getting-started/first-agent/)** — the shortest path to a
  working loop.
- **[Your first trace](/getting-started/first-trace/)** — turn on tracing and
  read the result.
- **[Cookbook](/cookbook/)** — complete programs that solve a real task.
