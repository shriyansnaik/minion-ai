---
title: Tools
description: How Minion turns a Python function into a tool — types, docstrings, argument coercion, errors, and thread safety.
sidebar:
  order: 1
---

A tool is a Python function. Pass it in `tools=[...]` and Minion derives the
schema the model sees from the function itself.

```python
def get_weather(city: str, unit: str = "celsius") -> str:
    """Get the current weather for a city.

    Args:
        city: Name of the city.
        unit: Temperature unit, either 'celsius' or 'fahrenheit'.
    """
    ...

agent = minions.Minion(model="openai/gpt-4o", tools=[get_weather])
```

## What becomes what

| In your function | What the model sees |
| --- | --- |
| Function name | The tool name it must call |
| First line of the docstring | What the tool is for |
| Parameter name | The argument key |
| Type annotation | The argument's declared type |
| `Args:` line for that parameter | The argument's description |

Docstrings are parsed with
[docstring_parser](https://github.com/rr-/docstring_parser), so Google, NumPy and
reST styles all work. Only the **short description** (the first line) is passed
to the model — a long explanatory paragraph below it is for humans, and costs
you nothing in tokens.

A parameter with no annotation is described as `string`. A parameter with no
`Args:` entry gets an empty description, and the model will guess what to put
there. Both are silent, so it is worth being deliberate:

```python
# The model has no idea what `mode` accepts.
def export(path, mode): ...

# The model knows exactly what to send.
def export(path: str, mode: str = "csv") -> str:
    """Write the current report to disk.

    Args:
        path: Destination file path.
        mode: Output format — one of 'csv', 'json', or 'parquet'.
    """
```

## Argument types and coercion

The model returns arguments as strings. Minion coerces each one to the type
declared on your signature before calling the function:

| Annotation | Coercion |
| --- | --- |
| `int`, `float` | Parsed numerically |
| `bool` | Anything except `"false"`, `"0"`, `""`, `"none"`, `"null"` is `True` (case-insensitive) |
| `list`, `dict` | Parsed as JSON |
| anything else | Passed through as the raw string |

If a value can't be parsed — the model sends `"about twelve"` for an `int` —
the **raw string is passed through** rather than raising. A malformed argument
degrades into something your function can inspect and reject, instead of
crashing the run before it starts. Which brings us to errors.

## Return errors, don't raise them

An exception inside a tool propagates out of `agent(...)` and ends the run. That
is occasionally what you want. Far more often, the model could have recovered if
you had simply told it what went wrong:

```python
def read_file(file_path: str, encoding: str = "utf-8") -> str:
    """Reads the contents of a file and returns them as a string.

    Args:
        file_path: Path to the file to be read.
        encoding: Character encoding to use when decoding the file.

    Returns:
        The file's contents, or an error message string if it can't be read.
    """
    try:
        with open(file_path, "r", encoding=encoding) as f:
            return f.read()
    except FileNotFoundError:
        return f"File not found: {file_path}"
    except PermissionError:
        return f"Permission denied: {file_path}"
```

The returned string goes back into the conversation as the tool's output, so the
model reads `File not found: /reprots/q3.md`, notices the typo, and retries. A
raised `FileNotFoundError` just kills the run.

Rule of thumb: **raise for programmer errors, return for world errors.** A
missing file, a 404, a rate limit, an empty result set — those are facts about
the world that the agent should be allowed to react to.

The bundled `minions.demo_tools` module follows this pattern and is meant to be
read and copied, not imported into production.

## Return values

Anything is allowed; it is stringified when it goes back into the conversation.
Return the shape that reads best to a model:

```python
def list_files(directory: str) -> list[str] | str:
    """Lists all file paths within a directory."""
    if not os.path.isdir(directory):
        return f"Not a directory: {directory}"
    return [os.path.join(directory, e) for e in os.listdir(directory)]
```

A list of strings, a dict, or a compact table all work. Very large returns are
worth trimming — everything a tool returns is re-sent to the model on every
subsequent turn of that run, so a 200 KB blob is paid for repeatedly.

## The built-in tools

Minion appends tools of its own to every agent:

| Tool | Always? | What it does |
| --- | --- | --- |
| `_finish` | Yes | Ends the run. Its `final_response` argument becomes `RunResult.output`. |
| `_spawn_sub_minion` | With `allow_sub_agents=True` | Spins up an ad-hoc worker — see [Sub-agents](/guides/sub-agents/). |
| *(one per specialist)* | With `sub_minions=[…]` | Calls that specialist by name. |

You never define or call these; they show up in traces alongside your own tools.
Avoid naming your own functions with a leading underscore to keep the
distinction clean.

## Thread safety

With [`parallel_tools=True`](/guides/parallel-tools/), a turn's tool calls run
on different threads simultaneously — and with sub-agents that nests further.
Your tools must tolerate that.

The common trap is a module-level client:

```python
# Wrong under parallel_tools: one Session shared across threads.
client = SomeAPIClient(os.environ["API_KEY"])

def search(query: str) -> list[dict]:
    """Search the web."""
    return client.search(query)
```

Most HTTP SDK clients wrap a `requests.Session`, which is **not** thread-safe;
sharing one corrupts its connection pool and surfaces as
`ConnectionResetError(10054)` or `ProtocolError('Connection aborted.')` — errors
that look like network flakiness and aren't. Construct per call instead:

```python
def search(query: str) -> list[dict]:
    """Search the web and return relevant results.

    Args:
        query: The search query.
    """
    client = SomeAPIClient(os.environ["API_KEY"])
    return client.search(query)
```

The same applies to database connections and any object holding mutable state.
If a tool genuinely can't be made thread-safe, leave `parallel_tools=False` (the
default) and it will never run concurrently within a turn.

:::caution
Tools run with your process's full privileges. Minion does not sandbox them.
Treat a tool that writes files, calls an internal API, or spends money the way
you'd treat any code driven by untrusted input — validate arguments inside the
function, and prefer narrow tools (`refund_order(order_id)`) over general ones
(`run_sql(query)`).
:::

## Restricting tools per sub-agent

When an agent spawns an ad-hoc worker it can pass `tool_list` to hand that worker
only a subset of the tools — useful for keeping a summarising worker away from
anything that writes. See [Sub-agents](/guides/sub-agents/#restricting-a-workers-tools).
