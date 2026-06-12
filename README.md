# Minion AI

A lightweight, provider-agnostic agentic framework. Build AI agents that think, use tools, and delegate to sub-agents — with observability baked in.

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

## Configuration

```python
minions.init(
    api_key="...",        # optional if env var is set
    base_url="...",       # custom endpoint (Azure, vLLM, Ollama, etc.)
    tracing=True,         # enable observability (coming soon)
    ui_url="http://localhost:7337",
)
```

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
