# Multi-Agent Minions

A single `Minion` is one agent with tools. Real work often needs a *team*: a
manager that delegates to specialists. Minions gives you two ways to delegate,
and you can mix them freely.

| Style | What it is | When to use |
|---|---|---|
| **Generic sub-minions** | `allow_sub_agents=True` adds a `_spawn_sub_minion` tool the model uses to spin up *ad-hoc* helpers on the fly. | Fan-out over many similar items (e.g. read 100 files across 25 workers). |
| **Specialist sub-minions** | `sub_minions=[...]` registers *pre-built, named* minions as tools the manager can call by name. | A fixed team of experts — a researcher, a writer, a reviewer. |

This guide builds a small "editor company": a **manager** that uses a
**researcher** to gather facts and a **writer** to turn them into an article.

---

## 1. Setup

```python
from minions import Minion
import minions as mn

mn.init(api_key="sk-...", tracing=True, project="test")
```

`tracing=True` records every run so you can inspect the whole agent tree later in
the dashboard (`minion ui`). `project` groups those runs.

---

## 2. Give the researcher some tools

The researcher needs to actually look things up. Here we wrap the
[Tavily](https://tavily.com) search API as two plain functions — any function
with a docstring becomes a tool:

```python
from tavily import TavilyClient

client = TavilyClient("tvly-...")

def search(query: str) -> list[dict]:
    """Search the web and return relevant results.

    Args:
        query: The search query, e.g. "who won ipl 2026".

    Returns:
        A list of results, each a dict with 'title', 'url', and 'content'.
    """
    response = client.search(query=query, search_depth="advanced")
    return response["results"]

def extract(urls: list[str]) -> list[dict]:
    """Extract the full content of one or more web pages.

    Args:
        urls: The page URLs to extract, e.g. ["https://example.com/article"].

    Returns:
        A list of results, each a dict with 'url' and 'raw_content'.
    """
    response = client.extract(urls=urls)
    return response["results"]
```

---

## 3. Build the specialists

A minion becomes a **specialist** the moment you give it a `name` and a
`description`. The manager shows the model *only* the name + description (not the
specialist's full system prompt), so delegation stays cheap on tokens.

```python
researcher = Minion(
    name="researcher",
    description="Researches a topic; returns findings with sources.",
    model="gpt-4o",
    tools=[search, extract],
    system_prompt=(
        "You are a meticulous researcher. Give a comprehensive research for the "
        "given topic using search and extract tools. Do not use your own knowledge"
    ),
)

writer = Minion(
    name="writer",
    description="Drafts a nice markdown based sweet and short article based on the input",
    model="gpt-4o",
    system_prompt="Draft a nice markdown based sweet and short article based on the input",
)
```

> **`name` and `description` are required** for any minion you pass into another
> minion's `sub_minions`. The `name` is how the manager calls it; the
> `description` is how the manager's model decides *when* to call it. Make the
> description say what the specialist does, in one line.

---

## 4. Build the manager

The manager gets the specialists via `sub_minions`. It needs no tools of its own —
its job is to delegate and assemble.

```python
editor_company = Minion(
    model="gpt-5.1-chat-latest",
    sub_minions=[researcher, writer],
    allow_sub_agents=True,
    system_prompt=(
        "You are a manager of a big editor company. Use the researcher to research "
        "the user's topic and the writer at your disposal to publish a good article. "
        "Do not use your own knowledge. Use researcher to research the topic and "
        "writer to write a professional article. Publish it as is by the writer and "
        "do not rephrase"
    ),
)
```

A few things worth knowing:

- **`sub_minions=[researcher, writer]`** registers the two specialists as tools
  named `researcher` and `writer`.
- **`allow_sub_agents=True`** *also* gives the manager the generic
  `_spawn_sub_minion` tool. You can drop this if you only want the named team.
- Each specialist runs with **its own** system prompt and tools — the
  researcher's "use search/extract, no own knowledge" rule applies only inside
  the researcher, not the manager.

---

## 5. Run it

```python
res = editor_company("Write an appreciation article on IPL 2026 winner and the man of the match")
print(res)
```

As it runs, the console labels every turn with the minion that produced it, so
you can follow the hand-offs. Trimmed:

```
===== gpt-5.1-chat-latest =====        ← the manager
Thought: 'I will first ask the researcher to gather accurate information ...'
Tool_1: 'researcher'
Args: input='Research and provide verified details on the IPL 2026 winner ...'

===== researcher =====                 ← the researcher, running its own loop
Thought: 'I should first search for up-to-date information ...'
Tool_1: 'search'   Args: query='IPL 2026 final winner and man of the match'
Tool_2: 'search'   Args: query='IPL 2026 final match highlights'
Tool_3: 'search'   Args: query='IPL 2026 notable performances'

===== researcher =====
Tool_1: '_finish'
Args: final_response='The IPL 2026 final concluded with Royal Challengers Bengaluru ...'

===== gpt-5.1-chat-latest =====        ← back in the manager
Thought: "I will now pass the researcher's findings to the writer ..."
Tool_1: 'writer'
Args: input='Write a sweet and short professional appreciation article ...'

===== writer =====                     ← the writer, running its own loop
Tool_1: '_finish'
Args: final_response='# IPL 2026 Final: A Tribute to Royal Challengers Bengaluru ...'

===== gpt-5.1-chat-latest =====        ← manager publishes the writer's output
Tool_1: '_finish'
Args: final_response='# IPL 2026 Final: A Tribute to Royal Challengers Bengaluru ...'
```

> **Reading the labels:** each `=====` header is a *different* minion's turn.
> When you see `_finish` under `researcher`, that's the researcher ending *its*
> run and handing its answer back to the manager — not the manager finishing.
> Every minion runs its own independent loop and calls `_finish` exactly once.

---

## 6. The result

`__call__` returns a `RunResult`, not a bare string:

```python
print(res)         # the final article (RunResult prints as its output)
res.output         # the article string
res.trace_id       # handle to this run in the dashboard
```

`RunResult` prints as its `output`, so `print(res)` just shows the article.
`trace_id` is your handle to the exact run — useful for finding it in the UI.

---

## 7. See the whole team in the dashboard

Start the viewer:

```bash
minion ui
```

Open the `test` project and click the run. Tracing captures the **full tree**:
the manager's run, and nested under each delegation tool call an **"Open trace ↗"**
button that jumps into that specialist's own run — the researcher's searches, the
writer's draft, each with its own turns, tokens, and cost. The nesting is
recursive, so a specialist that itself delegates shows up one level deeper.

---

## How it composes

You can nest these to any depth, in any combination, and the trace tree always
links up correctly:

- **Generic → specialist** — a spawned generic worker automatically inherits the
  manager's specialists, so it can call `researcher`/`writer` too. (It can't
  spawn *more* generic workers, which keeps recursion bounded.)
- **Specialist → specialist** — build a specialist with its own
  `sub_minions=[...]`. It's just a normal `Minion`, so nothing special is needed.
- **Specialist → generic** — build a specialist with `allow_sub_agents=True`.

Because a `Minion` holds only immutable config (the per-run state lives in a
throwaway object created on each call), the same specialist can be **safely run
concurrently** — e.g. a manager fanning out the researcher across several topics
in parallel threads. Each call gets its own isolated run and its own trace.

---

## Cheat sheet

| You want… | Do this |
|---|---|
| A fixed team of named experts | Pass them in `sub_minions=[...]` (each needs `name` + `description`). |
| Ad-hoc fan-out over many items | Set `allow_sub_agents=True`; the model uses `_spawn_sub_minion`. |
| Both | Use them together (as in this guide). |
| A different/cheaper model for ad-hoc workers | Set `secondary_model=...` on the manager. |
| The run's handle for the dashboard | Read `res.trace_id`. |
