---
title: Parallel tools
description: Run a turn's independent tool calls concurrently, and keep per-call latency honest while doing it.
sidebar:
  order: 3
---

The model often asks for several tools in a single turn:

```
Thought: 'Let me look up the weather and population for both cities.'
Tool_1: 'get_weather'     Args: city='Oslo'
Tool_2: 'get_weather'     Args: city='Lisbon'
Tool_3: 'get_population'  Args: city='Oslo'
Tool_4: 'get_population'  Args: city='Lisbon'
```

By default Minion runs those four sequentially. Set `parallel_tools=True` and
they run at once:

```python
agent = minions.Minion(
    model="openai/gpt-4o",
    tools=[get_weather, get_population],
    parallel_tools=True,
)
```

Four calls at 400 ms each go from ~1.6 s to ~400 ms. For an agent whose tools are
mostly network I/O — search, HTTP fetches, database queries — this is usually
the single largest latency win available.

## When it applies

Parallelism happens **within one turn**, only when the model asked for more than
one tool. A turn with a single tool call takes the sequential path regardless.

Minion does not reorder or split the model's plan. If the model wants two calls
in one turn, it has already decided they're independent — the system prompt
tells it to "call independent tools simultaneously; only sequence tools when one
depends on another's output". Parallel execution takes it at its word.

Results are collected and recorded in the model's original order, so the
conversation the model sees next turn is identical either way. Only the wall
clock changes.

## Latency stays accurate

Each call is timed individually, around its own invocation, rather than by
slicing up the turn's total. So four calls that overlap show their true
durations:

| Tool | Latency |
| --- | --- |
| `get_weather` (Oslo) | 412 ms |
| `get_weather` (Lisbon) | 388 ms |
| `get_population` (Oslo) | 51 ms |
| `get_population` (Lisbon) | 47 ms |

The per-tool latencies no longer sum to the turn latency — that's the point.
When they overlap, a turn is as slow as its slowest tool, and the table tells
you which one to fix.

## Your tools must be thread-safe

This is the whole cost of the feature, and it's a real one. With
`parallel_tools=True` a turn's tools run on separate threads, and with
sub-agents that nests: a manager runs specialists in parallel, and each
specialist runs its own tools in parallel.

The usual failure is a shared client:

```python
# Wrong: one Session shared across every thread.
client = SomeAPIClient(os.environ["API_KEY"])

def search(query: str) -> list[dict]:
    """Search the web."""
    return client.search(query)
```

Most SDK clients wrap a `requests.Session`, which is not thread-safe. Sharing
one corrupts its connection pool and shows up as `ConnectionResetError(10054)`
or `ProtocolError('Connection aborted.')` — symptoms that read like a flaky
network and are not.

Build per call instead:

```python
def search(query: str) -> list[dict]:
    """Search the web and return relevant results.

    Args:
        query: The search query.
    """
    client = SomeAPIClient(os.environ["API_KEY"])
    return client.search(query)
```

The same rule covers database connections, file handles, and any module-level
mutable state your tools touch. If you can't make a tool thread-safe, leave
`parallel_tools` off — the default is `False` precisely because this has to be
an opt-in.

:::caution
Rate limits are the other thing to check. Four concurrent calls to an API that
allows two per second will start returning 429s. Either handle that inside the
tool (return the error as a string so the agent can back off — see
[Tools](/guides/tools/#return-errors-dont-raise-them)) or keep the agent
sequential.
:::

## Sub-agents inherit it

A worker spawned by `_spawn_sub_minion` inherits the parent's `parallel_tools`
setting, so turning it on at the top applies all the way down. Named specialists
do **not** inherit it — they're independent minions you configured yourself, so
set `parallel_tools=True` on each one you want it on.

## Should you turn it on?

| | |
| --- | --- |
| **Yes** | Tools are I/O-bound (HTTP, search, DB reads) and side-effect free or independently safe |
| **Yes** | You're fanning out with sub-agents and want the fan-out to actually be parallel |
| **No** | Tools share a client, connection, or file handle you can't make per-call |
| **No** | Tools have ordering-sensitive side effects (writes to the same file, sequential state machine) |
| **No** | You're near a provider rate limit |
