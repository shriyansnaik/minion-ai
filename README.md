<p align="center">
  <img src="https://raw.githubusercontent.com/shriyansnaik/minion-ai/main/assets/minions-logo.png" alt="Minions" height="60" />
</p>

<p align="center">
  A lightweight agentic framework with observability baked in.<br/>
  Build agents that think, use tools, and delegate — then see every turn, token and dollar.
</p>

<p align="center">
  <a href="https://pypi.org/project/minion-ai"><img src="https://img.shields.io/pypi/v/minion-ai.svg" alt="PyPI" /></a>
  <a href="https://pypi.org/project/minion-ai"><img src="https://img.shields.io/pypi/pyversions/minion-ai.svg" alt="Python versions" /></a>
</p>

<p align="center">
  <b><a href="https://minions-ai.vercel.app">Docs</a></b> ·
  <a href="https://minions-ai.vercel.app/getting-started/installation/">Quickstart</a> ·
  <a href="https://minions-ai.vercel.app/cookbook/">Cookbook</a> ·
  <a href="https://minions-ai.vercel.app/changelog/">Changelog</a>
</p>

<!-- DEMO VIDEO / GIF GOES HERE — see ROADMAP.md -->

---

## Install

```bash
pip install minion-ai
```

## Quick start

```python
import minions

def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: Name of the city.
    """
    return f"{city}: 22°C, clear"

minions.init(tracing=True, project="demo")

agent = minions.Minion(model="openai/gpt-4o", tools=[get_weather])
print(agent("Should I take a jacket in Oslo today?"))
```

```bash
minion serve      # dashboard on http://localhost:7337
```

A tool is a plain function — its signature and docstring *are* the schema.
Tracing is one flag, and writes to a local SQLite file you own.

## What you get

- **Tools from plain functions** — docstring + type hints, nothing to keep in sync
- **Sub-agents** — ad-hoc workers for fan-out, or named specialists you compose
- **Parallel tool calls** — `parallel_tools=True`, with per-call latency that stays honest
- **Local tracing** — every run, turn and tool call to SQLite, no account required
- **Cost tracking** — per turn and per run, from a built-in table of 145 models
- **A dashboard you run** — filter, drill into any turn, roll spend up by day or model
- **Remote tracing** — point a team's agents at one server you host

## Supported models

Minion asks the model for a strict JSON envelope every turn, so **a model works
only if its provider supports native JSON-schema structured output**.

| Tier | Models | Status |
| --- | --- | --- |
| **1** | OpenAI, Anthropic, Gemini | Supported — tested before each release |
| **2** | Any other LiteLLM model with native schema output (`groq/openai/gpt-oss-120b`, Azure, vLLM) | Should work, not release-tested |
| **3** | Models without schema output (`groq/llama-3.3-70b-versatile`, most small local models) | Not supported natively — usable via `structured_output="prompt"` |

```python
import litellm
litellm.supports_response_schema(model="openai/gpt-4o")   # check before you commit
```

Switching provider is just the model string:

```python
minions.Minion(model="anthropic/claude-opus-4", tools=[get_weather])
```

Full matrix and failure modes: **[Provider support](https://minions-ai.vercel.app/reference/providers/)**.

## Docs

Everything lives at **[minions-ai.vercel.app](https://minions-ai.vercel.app)**:

| | |
| --- | --- |
| [Getting started](https://minions-ai.vercel.app/getting-started/what-is-minion/) | Install, first agent, first trace |
| [Guides](https://minions-ai.vercel.app/guides/tools/) | Tools, sub-agents, parallel tools, tracing, cost, the dashboard |
| [Cookbook](https://minions-ai.vercel.app/cookbook/) | Complete runnable programs |
| [Deployment](https://minions-ai.vercel.app/deployment/choosing-a-database/) | SQLite vs Postgres, self-hosting, remote tracing |
| [Reference](https://minions-ai.vercel.app/reference/minion/) | `Minion(...)`, `init(...)`, the CLI, providers |
| [Contributing](https://minions-ai.vercel.app/contributing/) | Repo layout, dev loop, migrations, releasing |

## Contributing

Issues and PRs welcome — see
[Contributing](https://minions-ai.vercel.app/contributing/) for the repo layout
and the dev loop. Reports from **Tier 2 models** are especially useful: if you
ran Minion on a model that isn't in the table above, both answers help.

Roadmap and status: [ROADMAP.md](ROADMAP.md).
