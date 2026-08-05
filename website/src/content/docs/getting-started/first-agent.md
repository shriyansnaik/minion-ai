---
title: Your first agent
description: Build a working tool-using agent in about twenty lines, and understand every part of it.
sidebar:
  order: 3
---

We'll build an agent that answers questions about a city by calling two tools.
The whole program is below; the rest of the page explains it.

```python
# first_agent.py
import minions

def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: Name of the city, e.g. "Oslo".
    """
    fake = {"Oslo": "4°C, light rain", "Lisbon": "24°C, sunny"}
    return fake.get(city, f"No weather data for {city}")

def get_population(city: str) -> int:
    """Get the population of a city.

    Args:
        city: Name of the city, e.g. "Oslo".
    """
    fake = {"Oslo": 709_000, "Lisbon": 548_000}
    return fake.get(city, 0)

agent = minions.Minion(
    model="openai/gpt-4o",
    tools=[get_weather, get_population],
)

result = agent("Compare Oslo and Lisbon for a weekend trip this week.")
print(result)
```

```bash
export OPENAI_API_KEY="sk-..."
python first_agent.py
```

## What each piece does

### The tools

```python
def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: Name of the city, e.g. "Oslo".
    """
```

Minion turns this into a tool schema by reading the function directly:

- the **function name** becomes the tool name,
- the **short description** (first line of the docstring) tells the model what
  the tool is for,
- each **parameter** contributes its type annotation and its `Args:` line.

So the docstring is not documentation *about* the tool — it is the tool's
interface. A parameter with no `Args:` entry reaches the model with an empty
description, and the model will guess. Write them.

Full details, including argument coercion and error handling, are in
[Tools](/guides/tools/).

### The Minion

```python
agent = minions.Minion(
    model="openai/gpt-4o",
    tools=[get_weather, get_population],
)
```

`model` is a LiteLLM `provider/model` string. `tools` is a plain list of
functions. Everything else has a default — including `max_turns=10`, which caps
how many think-act cycles a single run may take.

A `Minion` holds only immutable configuration. That makes it reusable and
thread-safe: you can call the same agent from many threads at once, or hand it
to another minion as a specialist, without runs interfering.

### The call

```python
result = agent("Compare Oslo and Lisbon for a weekend trip this week.")
```

Calling the agent runs the loop until the model calls `_finish`, or until
`max_turns` is hit.

`_finish` is a built-in tool that Minion appends to every agent. It is the
explicit termination signal — an agent doesn't "decide to stop talking", it
calls a tool whose argument is the final answer. That is why a run always has a
clean end and why the final answer is a first-class value rather than the last
thing that happened to be printed.

## Reading the output

As it runs, each turn is printed with the model (or specialist name) that
produced it:

```
===== openai/gpt-4o =====
Thought: 'Let me look up the current conditions and size of both cities.'
Tool_1: 'get_weather'     Args: city='Oslo'
Tool_2: 'get_weather'     Args: city='Lisbon'
Tool_3: 'get_population'  Args: city='Oslo'
Tool_4: 'get_population'  Args: city='Lisbon'

===== openai/gpt-4o =====
Thought: 'I have everything I need to compare them.'
Tool_1: '_finish'
Args: final_response='Lisbon is the better bet this weekend...'
```

Note the model asked for four tools in one turn. Minion runs them sequentially
by default; set [`parallel_tools=True`](/guides/parallel-tools/) to run
independent calls concurrently.

## The return value

`agent(...)` returns a `RunResult`, not a bare string:

```python
result = agent("Compare Oslo and Lisbon…")

print(result)        # prints the answer — RunResult stringifies to its output
result.output        # the answer as a str, or None if the run hit max_turns
result.trace_id      # handle to this run in the dashboard, or None if tracing is off
```

`RunResult.__str__` returns the output, so `print(result)` and f-strings behave
exactly like a string. Reach for `.output` when you need to test it (`if
result.output is None:`) and `.trace_id` when you want to find the run in the
dashboard.

## When it doesn't finish

If the model burns through `max_turns` without calling `_finish`, the run ends
and `result.output` is `None`:

```
OOPS!! [openai/gpt-4o] 10 turns were not enough
```

That usually means the task genuinely needs more turns (raise `max_turns`), or
the agent is stuck in a loop because a tool keeps returning something it can't
use. Turning on tracing makes the difference obvious — which is next.

## Next

**[Your first trace →](/getting-started/first-trace/)**
