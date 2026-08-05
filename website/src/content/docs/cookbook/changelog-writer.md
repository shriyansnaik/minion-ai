---
title: Changelog writer
description: An agent that reads a release's commits and drafts the changelog entry, with the diff available when a message isn't enough.
---

Writing a changelog by hand means reading fifty commit messages and translating
them into things a user cares about. The commits are right there in git — this
agent reads them and drafts the entry.

## The program

```python
# changelog_writer.py
import subprocess
import minions

MAX_OUTPUT = 20_000   # keep any single tool result from swamping the context


def _git(*args: str) -> str:
    """Run a read-only git command, returning stdout or a readable error."""
    try:
        proc = subprocess.run(
            ["git", *args],
            capture_output=True,
            # Decode explicitly. `text=True` alone uses the locale codec, which
            # on Windows is cp1252 and raises on any byte a diff happens to
            # contain — losing the output entirely.
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
    except FileNotFoundError:
        return "git is not installed or not on PATH"
    except subprocess.TimeoutExpired:
        return f"git {' '.join(args)} timed out after 30s"

    if proc.returncode != 0:
        return f"git {' '.join(args)} failed: {(proc.stderr or '').strip()}"

    out = (proc.stdout or "").strip()
    if len(out) > MAX_OUTPUT:
        return out[:MAX_OUTPUT] + f"\n… truncated, {len(out) - MAX_OUTPUT} more characters"
    return out or "(no output)"


def list_tags() -> str:
    """List the repository's git tags, newest first.

    Returns:
        One tag per line, or an error message.
    """
    return _git("tag", "--sort=-creatordate")


def list_commits(since: str, until: str = "HEAD") -> str:
    """List commits between two refs, with their full messages.

    Args:
        since: The earlier ref — a tag, branch, or commit sha.
        until: The later ref. Defaults to HEAD.

    Returns:
        One commit per block: short sha, subject, and body.
    """
    return _git("log", f"{since}..{until}", "--no-merges", "--pretty=format:%h %s%n%b%n---")


def show_commit(sha: str) -> str:
    """Show the full diff of a single commit.

    Use this only when a commit message alone doesn't explain what changed.

    Args:
        sha: The commit sha, full or short.

    Returns:
        The commit's patch, truncated if very large.
    """
    return _git("show", sha, "--stat", "--patch")


minions.init(tracing=True, project="changelog")

writer = minions.Minion(
    model="openai/gpt-4o",
    tools=[list_tags, list_commits, show_commit],
    parallel_tools=True,
    max_turns=15,
    system_prompt=(
        "You write changelog entries in Keep a Changelog style.\n"
        "Work from the commits, not from guesses. If a commit message is too "
        "terse to classify, look at its diff before deciding.\n"
        "Write for someone upgrading the package: say what changed for them and "
        "what they must do about it. Skip pure refactors, formatting, and CI "
        "changes unless they alter behaviour.\n"
        "Mark anything that breaks an existing usage as **Breaking:** and say "
        "what to change.\n"
        "Output only the markdown for the new section — no preamble."
    ),
)

result = writer(
    "Draft the changelog section for everything since the most recent tag. "
    "Find the tag yourself.",
    metadata={"repo": "minion-ai", "prompt_version": "v1"},
)

print(result)
```

```bash
cd /path/to/your/repo
python changelog_writer.py
```

## What to notice

**One private helper, three narrow tools.** `_git` is not a tool — it starts
with an underscore and is never passed in `tools`. The agent gets three specific
verbs instead of a general `run_git(command)`. That's the difference between an
agent that can read history and one that can `git push --force`.

**Errors come back as strings.** A bad ref returns `git log v9.9.9..HEAD
failed: unknown revision` and the model reads it, checks `list_tags`, and tries
again. Raising would end the run over a typo. See
[Tools](/guides/tools/#return-errors-dont-raise-them).

**The subprocess decodes explicitly.** `text=True` on its own uses the locale
codec — cp1252 on a default Windows install — and a diff containing one byte it
can't decode raises inside `subprocess`, leaving `proc.stdout` as `None`. Pass
`encoding="utf-8", errors="replace"` to any subprocess whose output you don't
control. (This one bit while writing the recipe.)

**Output is truncated at the tool.** Every tool result is re-sent on every
later turn of the run, so one unbounded `git show` on a 5,000-line commit is
paid for repeatedly. The truncation notice tells the model it's seeing a
fragment, which is better than silently cutting it off.

**`parallel_tools=True` is safe here** because each call spawns its own
`subprocess` and shares nothing. That matters — the model typically asks for
several `show_commit` calls at once.

**`show_commit` has a usage rule in its docstring.** "Use this only when a
commit message alone doesn't explain what changed" is instruction to the model,
placed where the model actually reads it.

## Reading the trace

```bash
minion serve
```

Open the `changelog` project. The first turn is usually `list_tags`, the second
`list_commits`, and then a fan of `show_commit` calls for the ambiguous ones —
which tells you something useful about your own commit messages. If the agent
has to open ten diffs, ten of your commit messages didn't say enough.

Because the run is tagged `prompt_version=v1`, changing the system prompt and
re-running under `v2` lets you filter the trace list and compare the two on cost
and turn count directly.

## Variations

- **Group by area** — add `list_files_changed(since, until)` wrapping
  `git diff --name-only` and ask for sections per subsystem.
- **Append instead of print** — add a `write_changelog(section: str)` tool that
  inserts under `## [Unreleased]`. Keep it narrow: one function that writes one
  known file, not a general file writer.
- **Cheaper** — most of this is summarising. Try a smaller model first; this is
  the kind of task where the gap is small.
