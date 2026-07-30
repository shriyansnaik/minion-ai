# Providers & model compatibility

Minion reaches models through [LiteLLM](https://github.com/BerriAI/litellm), so
switching provider is a model string:

```python
minions.Minion(model="openai/gpt-4o", ...)
minions.Minion(model="anthropic/claude-opus-4", ...)
minions.Minion(model="gemini/gemini-2.5-pro", ...)
```

API keys come from the standard env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY`, `GROQ_API_KEY`, …) or from `minions.init(api_key=...)`.

Reaching a provider is not the same as working with it. Read the tiers below before
picking a model.

## The one hard requirement: native structured output

Every turn, Minion asks the model for a strict JSON object — a thought plus the tool
calls to run — by passing the `MinionOutput` schema as `response_format`:

```json
{"next_thought": "...", "next_tools": [{"tool_name": "...", "args": [...]}]}
```

> **A model works with Minion only if its provider supports native JSON-schema
> structured output for that model.**

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

**OpenAI, Anthropic, Gemini.** These are what Minion is developed against and what
gets tested before a release. A bug here is a release blocker.

| Provider | Example model |
| --- | --- |
| OpenAI | `openai/gpt-4o` |
| Anthropic | `anthropic/claude-opus-4` |
| Gemini | `gemini/gemini-2.5-pro` |

### Tier 2 — Should work, not guaranteed

Any other LiteLLM-reachable provider **whose model supports native JSON-schema
output**. These aren't part of the release test pass. Expect them to work; report it
if they don't.

| Model | Notes |
| --- | --- |
| `groq/openai/gpt-oss-120b` | Verified end-to-end: multi-turn, 6 parallel tool calls, tracing, cost. The Groq model to use. |
| Azure / vLLM / other OpenAI-compatible via `base_url` | Depends entirely on whether the served model enforces schemas |

### Tier 3 — Not supported

Models without native JSON-schema output. These fail on the first turn — it is not a
degraded mode, nothing usable comes back.

| Model | Failure |
| --- | --- |
| `groq/llama-3.3-70b-versatile` | `BadRequestError ... tool_use_failed` (verified) |

Most small local models fall in this tier.

A fallback for these — prompt-injected schema plus a bounded reparse/retry — is
tracked in [ROADMAP.md](../ROADMAP.md) Phase 1. It would move much of Tier 3 into
Tier 2.

### What the Tier 3 failure looks like

For a model without schema support, LiteLLM emulates structured output by wrapping
the schema in a synthetic function called `json_tool_call`. `llama-3.3-70b` then
generated arguments for one tool instead of the required envelope, and Groq's
server-side validation rejected its own generation:

```
litellm.BadRequestError: GroqException - tool call validation failed:
parameters for tool json_tool_call did not match schema:
missing properties: 'next_thought', 'next_tools',
additionalProperties 'tool_name', 'args' not allowed
failed_generation: <function=json_tool_call>{"tool_name": "get_population",
                   "args": [{"key": "city", "value": "Tokyo"}]}?
```

The model understood the task — it did want to look up Tokyo — but couldn't hold the
nested shape.

## Verification status

Honest accounting of what has actually been run, as of 2026-07-30:

| Model | Verified |
| --- | --- |
| `groq/openai/gpt-oss-120b` | ✅ live run, passed |
| `groq/llama-3.3-70b-versatile` | ✅ live run, failed as documented |
| `groq/moonshotai/kimi-k2-instruct` | ⬜ untested — no account access (`model_not_found`). `supports_response_schema` reports `False`, so Tier 3 is *expected*, not confirmed |
| OpenAI, Anthropic, Gemini | ⬜ not yet covered by an automated test pass, despite being Tier 1 |

Closing that last gap — a scripted smoke test across the three Tier 1 providers — is
a Phase 1 item.

## Groq notes

- Use `groq/openai/gpt-oss-120b`; it supports both JSON-schema output and
  `reasoning_effort`.
- Groq models are **absent from the built-in price table**, so their traces show cost
  as unpriced. Add prices under a project's **Settings → Model Prices**, or wait for
  the built-in entries (Phase 1).
- The env var must be `GROQ_API_KEY` exactly — LiteLLM won't pick up a suffixed name
  like `GROQ_API_KEY_1`.
- `litellm.drop_params = True` is set globally, so params a model doesn't support
  (e.g. `reasoning_effort` on `llama-3.3-70b`) are dropped silently rather than
  erroring.
