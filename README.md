<p align="center">
  <img src="https://raw.githubusercontent.com/shriyansnaik/minion-ai/main/assets/minions-logo.png" alt="Minions" height="60" />
</p>

<p align="center">
  A lightweight, provider-agnostic agentic framework.<br/>
  Build AI agents that think, use tools, and delegate to sub-agents — with observability baked in.
</p>

---

## Install

```bash
pip install minion-ai
```

## Quick Start

```python
import minions
from minions.demo_tools import read_file, list_files

def search_web(query: str) -> str:
    """Search the web and return results.

    Args:
        query: The search query.
    """
    # your implementation
    ...

minions.init(api_key="your-api-key")  # or set ANTHROPIC_API_KEY / OPENAI_API_KEY env var

agent = minions.Minion(
    model="anthropic/claude-opus-4",
    tools=[search_web, read_file],
)

result = agent("Summarise the contents of report.pdf")
print(result)
```

## Supported Providers

Any provider supported by [LiteLLM](https://github.com/BerriAI/litellm) works out of the box — just change the model string:

```python
minions.Minion(model="openai/gpt-4o", ...)
minions.Minion(model="anthropic/claude-opus-4", ...)
minions.Minion(model="gemini/gemini-2.5-pro", ...)
```

API keys are read from the standard env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) or passed via `minions.init()`.

## Sub-Agents

Minion can spawn sub-agents to parallelise large tasks:

```python
agent = minions.Minion(
    model="anthropic/claude-opus-4",
    tools=[read_file, list_files],
    allow_sub_agents=True,
    secondary_model="anthropic/claude-haiku-4-5",  # cheaper model for sub-tasks
)

result = agent("Summarise every file in the /reports directory")
```

The agent automatically delegates when it sees 3+ independent items to process.

## Tracing & UI

Enable tracing to record every run, turn, and tool call to a local SQLite database, then inspect them in the built-in dashboard.

```bash
pip install "minion-ai[ui]"
```

```python
minions.init(
    api_key="...",
    tracing=True,
    project="my-project",   # required when tracing=True
)

agent = minions.Minion(model="openai/gpt-4o", tools=[...])
agent("Do something interesting")
```

Launch the dashboard:

```bash
minion ui
```

<p align="center">
  <img src="https://raw.githubusercontent.com/shriyansnaik/minion-ai/main/assets/minions-icon-tile.png" alt="Minions UI" height="80" />
</p>

The UI groups traces by project, lets you drill into every turn and tool call, and shows token usage and cost estimates in real time.

### Remote tracing (team server)

To send traces to a shared minion-ui server instead of a local file, add `trace_url`
and a project-scoped token (create one in the dashboard under a project's
**Settings → API Tokens**):

```python
minions.init(
    tracing=True,
    project="my-project",
    trace_url="https://traces.mycompany.com",
    tracing_secret_token="mni_xK9mP2...",
)
```

In this mode nothing is written locally — runs are pushed over HTTP to the server.
Tracing never raises: if the server is unreachable the push is skipped and your
agent keeps running.

### Running the server

The dashboard server ships as a container:

```bash
docker compose up            # SQLite (default), data in a named volume
```

For a team-scale deployment, point it at Postgres via `DATABASE_URL` (SQLite stays
the default when it's unset):

```bash
docker compose -f docker-compose.postgres.yml up          # self-hosted Postgres
docker compose -f docker-compose.managed-postgres.yml up  # RDS / Supabase / Neon
```

See **[docs/](docs/)** for full hosting, remote-tracing, and image-publishing guides.

## Building Tools

Any Python function with a docstring and typed args works as a tool:

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

See `minions/demo_tools.py` for more examples.
