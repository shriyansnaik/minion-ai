---
title: Installation
description: Install minion-ai, set a provider key, and confirm your model can do what Minion needs.
sidebar:
  order: 2
---

## Install

```bash
pip install minion-ai
```

Requires **Python 3.10+**. One package installs everything: the agent library,
the trace store, and the dashboard server (`minion serve`). There are no extras
to opt into.

## Connect your LLM

Minion reaches models through [LiteLLM](https://github.com/BerriAI/litellm), so a
model is identified by a `provider/model` string and the key comes from that
provider's standard environment variable.

```bash
export OPENAI_API_KEY="sk-..."        # openai/gpt-4o
export ANTHROPIC_API_KEY="sk-ant-..." # anthropic/claude-opus-4
export GEMINI_API_KEY="..."           # gemini/gemini-2.5-pro
```

Or pass the key in code:

```python
import minions

minions.init(api_key="sk-...")
```

:::note
`init(api_key=...)` sets one key globally for LiteLLM. If you use more than one
provider in the same process, use the per-provider environment variables
instead — they're matched to the model string automatically.
:::

### Custom endpoints

Anything that speaks the OpenAI API — Azure OpenAI, vLLM, a local gateway —
works through `base_url`:

```python
minions.init(
    api_key="...",
    base_url="https://my-gateway.internal/v1",
)
```

## Check your model will actually work

This is the one compatibility rule worth checking before you write any code.

Every turn, Minion asks the model for a strict JSON object — a thought plus the
tools to call next — by passing a schema as `response_format`:

```json
{"next_thought": "...", "next_tools": [{"tool_name": "...", "args": [...]}]}
```

**A model works with Minion only if its provider supports native JSON-schema
structured output for it.** Loose "JSON mode" is not enough; without schema
enforcement the model flattens the envelope and the run dies on turn 1.

```python
import litellm

litellm.supports_response_schema(model="openai/gpt-4o")                  # True
litellm.supports_response_schema(model="groq/llama-3.3-70b-versatile")   # False
```

| Tier | Models | Status |
| --- | --- | --- |
| **1** | OpenAI, Anthropic, Gemini | Supported — tested before each release |
| **2** | Any other LiteLLM model with native schema output | Should work, not release-tested |
| **3** | Models without schema output | Not supported — fails on turn 1 |

The full matrix, the exact failure mode, and per-provider notes live in
[Provider support](/reference/providers/).

## Verify the install

```bash
python -c "import minions; print(minions.Minion)"
minion serve --help
```

`minion serve` starts the dashboard on <http://localhost:7337>. It works before
you've recorded anything — you'll just see an empty project list.

## Next

**[Your first agent →](/getting-started/first-agent/)**
