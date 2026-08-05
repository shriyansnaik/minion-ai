---
title: Provider support
description: The one hard model requirement, the three support tiers, and exactly what has been verified.
sidebar:
  order: 4
---

Minion reaches models through [LiteLLM](https://github.com/BerriAI/litellm), so
switching provider is a model string:

```python
minions.Minion(model="openai/gpt-4o", tools=[...])
minions.Minion(model="anthropic/claude-opus-4", tools=[...])
minions.Minion(model="gemini/gemini-2.5-pro", tools=[...])
```

API keys come from the standard environment variables (`OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, …) or from
[`init(api_key=...)`](/reference/init/).

**Reaching a provider is not the same as working with it.** Read the tiers below
before committing to a model.

## The one hard requirement: native structured output

Every turn, Minion asks the model for a strict JSON object — a thought plus the
tools to call — by passing a schema as `response_format`:

```json
{"next_thought": "...", "next_tools": [{"tool_name": "...", "args": [...]}]}
```

:::danger[The rule]
A model works with Minion only if its provider supports **native JSON-schema
structured output** for that model.
:::

Loose "JSON mode" is not enough. Without schema enforcement the model typically
flattens the envelope — emitting a single bare tool call instead of the
`{next_thought, next_tools[]}` wrapper — and the run dies on turn 1.

Check any model before committing to it:

```python
import litellm

litellm.supports_response_schema(model="groq/openai/gpt-oss-120b")       # True
litellm.supports_response_schema(model="groq/llama-3.3-70b-versatile")   # False
```

## Support tiers

### Tier 1 — Supported

**OpenAI, Anthropic, Gemini.** What Minion is developed against and what gets
tested before a release. A bug here is a release blocker.

| Provider | Example model |
| --- | --- |
| OpenAI | `openai/gpt-4o` |
| Anthropic | `anthropic/claude-opus-4` |
| Gemini | `gemini/gemini-2.5-pro` |

### Tier 2 — Should work, not guaranteed

Any other LiteLLM-reachable provider **whose model supports native JSON-schema
output**. Not part of the release test pass. Expect them to work; please report
it if they don't.

| Model | Notes |
| --- | --- |
| `groq/openai/gpt-oss-120b` | Verified end-to-end: multi-turn, 6 parallel tool calls, tracing, cost. The Groq model to use. |
| Azure / vLLM / other OpenAI-compatible via `base_url` | Depends entirely on whether the served model enforces schemas |

### Tier 3 — Not supported natively

Models without native JSON-schema output. On the default path these fail on the
first turn — it isn't a degraded mode, nothing usable comes back.

| Model | Native failure |
| --- | --- |
| `groq/llama-3.3-70b-versatile` | `BadRequestError … tool_use_failed` (verified) |

Most small local models fall in this tier.

They can still be driven through the **prompted fallback**:

```python
minions.Minion(model="groq/llama-3.3-70b-versatile", structured_output="prompt", tools=[...])
```

This puts the schema and a worked example in the system prompt, asks for
`json_object` mode, and re-prompts on a malformed reply (bounded by
`max_parse_retries`, default 2). Nothing enforces the shape, so it is a weaker
guarantee than Tier 1 — expect the occasional wasted turn, and expect it to cost
slightly more, since a reparse is a real extra call whose tokens are charged to
that turn.

It is not the default for exactly that reason. Treat it as "this model can be
made to work", not "this model is supported".

### What a Tier 3 failure looks like

For a model without schema support, LiteLLM emulates structured output by
wrapping the schema in a synthetic function called `json_tool_call`.
`llama-3.3-70b` then generated arguments for one tool instead of the required
envelope, and Groq's server-side validation rejected its own generation:

```
litellm.BadRequestError: GroqException - tool call validation failed:
parameters for tool json_tool_call did not match schema:
missing properties: 'next_thought', 'next_tools',
additionalProperties 'tool_name', 'args' not allowed
failed_generation: <function=json_tool_call>{"tool_name": "get_population",
                   "args": [{"key": "city", "value": "Tokyo"}]}
```

The model understood the task — it did want to look up Tokyo — but couldn't hold
the nested shape.

## Verification status

Honest accounting of what has actually been run:

| Model | Verified |
| --- | --- |
| `groq/openai/gpt-oss-120b` | ✅ live run, passed |
| `groq/llama-3.3-70b-versatile` | ✅ live run, failed as documented |
| `groq/moonshotai/kimi-k2-instruct` | ⬜ untested — no account access. `supports_response_schema` reports `False`, so Tier 3 is *expected*, not confirmed |
| OpenAI, Anthropic, Gemini | ⬜ not yet covered by an automated test pass, despite being Tier 1 |

Closing that last gap — a scripted smoke test across the three Tier 1 providers
— is a pre-launch blocker.

## Provider notes

### Groq

- Use `groq/openai/gpt-oss-120b`; it supports both JSON-schema output and
  `reasoning_effort`.
- The environment variable must be `GROQ_API_KEY` **exactly**. LiteLLM will not
  pick up a suffixed name like `GROQ_API_KEY_1`.
- Groq prices are in the built-in table for `gpt-oss-120b`, `gpt-oss-20b`,
  `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`. Other Groq models show
  as unpriced until you add a
  [custom price](/guides/cost-tracking/#custom-prices).

### Custom endpoints

Azure OpenAI, vLLM, and any OpenAI-compatible gateway work through `base_url`:

```python
minions.init(api_key="...", base_url="https://my-gateway.internal/v1")
```

Whether it works comes down to one thing: does the served model enforce the
response schema? A gateway that accepts `response_format` and ignores it will
fail the same way a Tier 3 model does.

### Unsupported parameters

`litellm.drop_params = True` is set globally, so parameters a model doesn't
support (for example `reasoning_effort` on a model without reasoning) are
dropped silently rather than raising. This keeps one `Minion` config portable
across models — at the cost of a silently ignored setting, so don't assume a
parameter took effect just because the call succeeded.

## What happens when a model can't do it

The provider error underneath is unhelpful on its own, so Minion translates it.
Instead of a raw `BadRequestError` you get a
`minions.structured_output.StructuredOutputError` naming the model, explaining
what was asked for, and listing the ways forward — with the provider's original
message appended for anyone who needs it:

```
The model 'groq/llama-3.3-70b-versatile' could not produce the structured
output Minion needs.

Every turn, Minion asks for a strict JSON object -- a thought plus the tools
to call next. This model's provider does not enforce that schema, so the
model returned something else and the provider rejected it.

What to do:
  1. Check the model:  litellm.supports_response_schema(model='...')
  2. Use a Tier 1 model (OpenAI, Anthropic, Gemini), or a Tier 2 model that
     supports native JSON-schema output.
  3. Or retry this model with the prompted fallback:
         Minion(..., structured_output="prompt")
  ...
```

An error that is *not* about structured output — a bad API key, a rate limit —
propagates unchanged. Minion doesn't claim every failure is a schema problem.
