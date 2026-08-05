---
title: Cookbook
description: Complete, runnable programs that each solve one real task — not snippets.
---

Each recipe here is a **whole program**. Copy the file, set one API key, run it.
No placeholders, no `...`, no imaginary services — the tools are standard
library, so nothing needs an account beyond your model provider.

| Recipe | Solves | Shows off |
| --- | --- | --- |
| [Changelog writer](/cookbook/changelog-writer/) | Turn a release's commits into a written changelog entry | Tools over `subprocess`, returning errors as strings, metadata for traceability |
| [Codebase explainer](/cookbook/codebase-explainer/) | Explain an unfamiliar repo without blowing the context window | Ad-hoc sub-agents, `secondary_model`, parallel tools |
| [Support triage](/cookbook/support-triage/) | Classify and route inbound tickets, with an audit trail | Named specialists, structured routing, metadata you can query later |

## Before you start

```bash
pip install minion-ai
export OPENAI_API_KEY="sk-..."
```

Every recipe uses `openai/gpt-4o`. Any [Tier 1 or Tier
2](/reference/providers/) model works — change the `model` string. Every recipe
also turns tracing on, so after running one you can open the dashboard and read
what actually happened:

```bash
minion serve
```

That is the point of running them, honestly. The code is short; the trace is
where you see the agent think, delegate, and spend.

## How these are written

A few conventions worth stealing, each of which is explained in the recipe that
first uses it:

- **Tools return errors as strings**, so the model can read the failure and
  retry instead of the run dying. See
  [Tools](/guides/tools/#return-errors-dont-raise-them).
- **Tools are built per call**, not shared at module scope, so
  `parallel_tools=True` is safe. See
  [Thread safety](/guides/tools/#thread-safety).
- **Every run carries metadata** you'd actually want to filter on later — a
  version, an id, an environment.
- **Nothing writes outside the working directory**, and nothing runs a command
  the agent composed freely. Tools are narrow on purpose.
