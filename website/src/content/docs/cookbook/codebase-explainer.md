---
title: Codebase explainer
description: Explain an unfamiliar repository by fanning the reading out across cheap sub-agents instead of stuffing every file into one context window.
---

Point this at a repo you've never seen and it produces an orientation document:
what the project does, how it's laid out, and where to start reading.

The interesting part isn't the prompt — it's that the manager never reads the
files. It delegates.

## The program

```python
# codebase_explainer.py
import os
import minions

SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", "dist", "build", ".astro"}
CODE_SUFFIXES = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".rb", ".java", ".md", ".toml", ".yml", ".yaml"}
MAX_CHARS = 15_000


def list_source_files(directory: str = ".") -> list[str] | str:
    """List source files in a directory tree, skipping vendor and build output.

    Args:
        directory: Directory to walk. Defaults to the current directory.

    Returns:
        A list of relative file paths, or an error message.
    """
    if not os.path.isdir(directory):
        return f"Not a directory: {directory}"

    found = []
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for name in files:
            if os.path.splitext(name)[1] in CODE_SUFFIXES:
                found.append(os.path.relpath(os.path.join(root, name), directory))
    if not found:
        return f"No source files found under {directory}"
    return sorted(found)[:500]


def read_source(file_path: str) -> str:
    """Read a source file.

    Args:
        file_path: Path to the file, relative to where the script was run.

    Returns:
        The file's contents, truncated if very long, or an error message.
    """
    # Checked up front: opening a directory raises IsADirectoryError on POSIX
    # but PermissionError on Windows, which would report a misleading reason.
    if os.path.isdir(file_path):
        return f"That's a directory, not a file: {file_path}"

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except FileNotFoundError:
        return f"File not found: {file_path}"
    except PermissionError:
        return f"Permission denied: {file_path}"

    if len(text) > MAX_CHARS:
        return text[:MAX_CHARS] + f"\n… truncated, {len(text) - MAX_CHARS} more characters"
    return text or "(empty file)"


minions.init(tracing=True, project="codebase-explainer")

explainer = minions.Minion(
    model="openai/gpt-4o",
    secondary_model="openai/gpt-4o-mini",
    tools=[list_source_files, read_source],
    allow_sub_agents=True,
    parallel_tools=True,
    max_turns=12,
    system_prompt=(
        "You orient a new engineer in an unfamiliar codebase.\n"
        "First list the files. Then delegate the reading: split them into "
        "coherent groups and give each sub-minion one group, asking for the "
        "purpose of each file and the key types, functions and entry points in "
        "it. Do not read the files yourself.\n"
        "Then synthesise a single markdown document with: what this project is, "
        "how it's structured, the main entry points, and the three files to read "
        "first with a sentence on why.\n"
        "Be concrete — name real files and real functions. Say so plainly if "
        "something is unclear from the code."
    ),
)

result = explainer(
    "Explain this codebase to a new engineer. Start from the current directory.",
    metadata={"target": os.path.basename(os.getcwd()), "prompt_version": "v1"},
)

print(result)
```

```bash
cd /path/to/some/repo
python codebase_explainer.py > ORIENTATION.md
```

## Why delegate at all

Read thirty files in one agent and by the last turn all thirty file bodies are
in the context window — re-sent, and re-paid for, on every turn. Delegate them
across six workers and the manager only ever sees six summaries.

The cost difference is not marginal. It's the difference between a context that
grows quadratically with the number of files and one that doesn't.

## What to notice

**`secondary_model` is where the savings are.** Summarising a file is exactly
the kind of narrow, well-specified job a small model does fine. The manager —
which has to hold the whole picture and write the synthesis — stays on the
larger model. Check the by-model breakdown in the dashboard after a run: the
mini model usually accounts for most of the tokens and a small slice of the
cost.

**`allow_sub_agents=True` plus an explicit instruction.** The base prompt already
tells the model to delegate at three or more independent items, but "do not read
the files yourself" in the `system_prompt` is what makes it stick. Without it,
models often read a few "just to get oriented" — and those are the expensive
ones.

**`parallel_tools=True` cascades.** Ad-hoc workers inherit it from the manager,
so the manager's six delegations run at once *and* each worker's file reads run
at once. On a real repo this is the difference between a minute and ten seconds.

**Both tools are safe under threads.** `os.walk` and `open` hold no shared
state. That's why parallelism is safe here without further thought — see
[Thread safety](/guides/tools/#thread-safety).

**The file list is capped at 500 and filtered.** An unbounded walk of a
`node_modules` tree would produce a list too large to be useful and expensive to
carry.

## Reading the trace

```bash
minion serve
```

Open the run and you'll see the shape: one `list_source_files` call, then a turn
with several `_spawn_sub_minion` calls, each carrying an **Open trace ↗** link
into that worker's own run — its file reads, its tokens, its cost. Then one
final turn where the manager writes the document.

If the manager is reading files itself, you'll see it immediately: `read_source`
calls in the *manager's* turns rather than in the workers'. That's a
`system_prompt` fix.

## Variations

- **Focus it.** Pass "Explain only the HTTP layer" as the input; the manager
  filters the file list before delegating.
- **Named specialists instead of ad-hoc workers.** A `tests_reader` and a
  `docs_reader` with different prompts, via
  [`sub_minions`](/guides/sub-agents/#named-specialists), when different kinds of
  file deserve different questions.
- **Answer questions instead of writing a document.** Same tools, input
  "Where is authentication enforced?" — the fan-out pattern is identical.
