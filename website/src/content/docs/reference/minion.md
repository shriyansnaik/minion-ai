---
title: Minion
description: Every argument to Minion(), how a run is invoked, and what comes back.
sidebar:
  order: 1
---

```python
minions.Minion(
    model,
    reasoning_effort=None,
    secondary_model=None,
    secondary_model_reasoning_effort=None,
    system_prompt=None,
    tools=None,
    sub_minions=None,
    allow_sub_agents=False,
    parallel_tools=False,
    max_turns=10,
    name=None,
    description=None,
    structured_output="auto",
    max_parse_retries=2,
)
```

A `Minion` holds only immutable configuration. All per-run state lives in a
throwaway object created inside `__call__`, so one instance is safe to call
concurrently and safe to reuse as another minion's specialist.

## Constructor arguments

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `model` | `str` | *required* | LiteLLM model string, e.g. `openai/gpt-4o`. Must support native JSON-schema structured output — see [Provider support](/reference/providers/). |
| `reasoning_effort` | `str` | `None` | Passed straight to the provider. Models that don't support it ignore it silently (`litellm.drop_params` is on). |
| `secondary_model` | `str` | `None` | Model for ad-hoc sub-agents. Defaults to `model` (with a printed notice) when `allow_sub_agents=True` and this is unset. |
| `secondary_model_reasoning_effort` | `str` | `None` | Reasoning effort for those sub-agents. Falls back to `reasoning_effort`. |
| `system_prompt` | `str` | `None` | Appended to Minion's base prompt under a "Special Instructions from User" heading — it augments the loop instructions rather than replacing them. |
| `tools` | `list[Callable]` | `[]` | Plain Python functions. See [Tools](/guides/tools/). |
| `sub_minions` | `list[Minion]` | `[]` | Pre-built specialists exposed as named tools. Each **must** have `name` and `description`. |
| `allow_sub_agents` | `bool` | `False` | Adds the `_spawn_sub_minion` tool for ad-hoc fan-out. |
| `parallel_tools` | `bool` | `False` | Run a turn's tool calls concurrently. Tools must be thread-safe — see [Parallel tools](/guides/parallel-tools/). |
| `max_turns` | `int` | `10` | Hard cap on think-act cycles per run. Exceeding it ends the run with `output=None`. |
| `name` | `str` | `None` | Required only when this minion is used as another's specialist. Becomes the tool name the parent calls. |
| `description` | `str` | `None` | Required alongside `name`. One line telling the parent's model when to delegate here. |
| `structured_output` | `str` | `"auto"` | How the output envelope is obtained — `"auto"`, `"native"`, or `"prompt"`. See below. |
| `max_parse_retries` | `int` | `2` | On the prompted path, how many times a malformed reply is fed back to the model before giving up. |

### `structured_output`

Minion needs a strict `{next_thought, next_tools[]}` object every turn. There are
two ways to get one, and this picks between them.

| Mode | Behaviour |
| --- | --- |
| `"auto"` *(default)* | Use native schema enforcement if the provider supports it for this model, otherwise the prompted path. If a model *claims* support and then rejects a schema, drop to the prompted path for the rest of the run and log a warning. |
| `"native"` | Always demand native enforcement. If the provider can't, raise. No silent fallback — use this when you'd rather fail than get a lower guarantee. |
| `"prompt"` | Always use the prompted path: the schema goes in the system prompt, the call asks for `json_object` mode, and a malformed reply is re-prompted up to `max_parse_retries` times. Works with more models; weaker guarantee. |

`"prompt"` is what makes [Tier 3](/reference/providers/) models usable at all. It
is genuinely less reliable — nothing is enforcing the shape, only asking for it
— so it isn't the default even though it works more widely.

Each reparse attempt is a real API call. Its tokens are added to that turn's
usage, so a run that retried costs more *and reports* that it cost more.

### Validation

`Minion(...)` raises `ValueError` when:

- a minion in `sub_minions` is missing `name` or `description`;
- two entries in `sub_minions` share a `name`.

Both are constructor-time, so a misconfigured team fails before any API call.

## Calling a minion

```python
result = agent(
    input,
    tags=None,
    metadata=None,
    parent_trace_id=None,
)
```

| Argument | Type | Description |
| --- | --- | --- |
| `input` | `str` | The task. This is the whole request — a minion has no conversation history across calls. |
| `tags` | `list` | Labels stored on the run and shown in the dashboard. Not filterable today. |
| `metadata` | `dict` | Key/value pairs stored on the run and **filterable** in the dashboard. Values are normalised to strings — see [how values are stored](/guides/tracing/#how-values-are-stored). |
| `parent_trace_id` | `str` | Links this run under another as a sub-run. Set automatically when Minion delegates; you rarely pass it by hand. |

Each call is independent. There is no session or memory between calls — to
continue a conversation, include the prior context in `input`.

## `RunResult`

```python
result = agent("…")

str(result)      # the output — RunResult stringifies to it
result.output    # str, or None if the run hit max_turns
result.trace_id  # str handle to the run, or None if tracing is off
```

`print(result)` and f-strings behave exactly like a string. Use `.output` when
you need to test the value (`if result.output is None:`) and `.trace_id` to find
the run in the dashboard.

## What a run does

1. Build the system prompt: tool schemas, plus the delegation sections that
   apply, plus your `system_prompt`.
2. Send the system prompt and the running conversation to the model, requesting
   a strict `{next_thought, next_tools[]}` JSON object.
3. Execute the requested tools — sequentially, or concurrently under
   `parallel_tools` when there is more than one.
4. Append each call and its output to the conversation.
5. Repeat from step 2, until a tool call is `_finish` or `max_turns` is reached.

The whole conversation is re-sent every turn. That is why trimming what tools
return matters for cost — see
[Cost tracking](/guides/cost-tracking/#keeping-costs-down).

## Built-in tools

Appended automatically; you never define them.

| Tool | Present when | Signature |
| --- | --- | --- |
| `_finish` | Always | `_finish(final_response: str)` — ends the run; the argument becomes `RunResult.output` |
| `_spawn_sub_minion` | `allow_sub_agents=True` | `_spawn_sub_minion(input: str, tool_list: list[str] = [])` — runs an ad-hoc worker on `secondary_model`; `tool_list` restricts which of the parent's tools it gets |
| *one per specialist* | `sub_minions=[…]` | `<name>(input: str)` — runs that specialist and returns its final answer |

Ad-hoc workers inherit the parent's specialists and `parallel_tools`, but never
`allow_sub_agents` — a worker cannot spawn further workers, which bounds
recursion.

## Errors

- **Exceptions from your tools propagate** out of `agent(...)` and end the run.
  The run is recorded as `failed` with the traceback. To let the model recover
  instead, return the error as a string — see
  [Tools](/guides/tools/#return-errors-dont-raise-them).
- **A model that can't produce structured output** raises
  `minions.structured_output.StructuredOutputError` — an explanation of what
  Minion asked for, why the provider refused, and the three ways forward
  (check the model, switch model, or try `structured_output="prompt"`), with
  the provider's original error appended. See
  [Provider support](/reference/providers/).
- **Hitting `max_turns`** is not an exception: the run ends, `output` is `None`,
  the run is marked failed with an explanatory message, and a line is printed to
  the console.

## Console output

Each turn prints a header naming the minion that produced it — the specialist's
`name` if it has one, otherwise its model string — followed by the thought and
the tool calls. In a team run, the headers are the hand-offs.

```
===== researcher =====
Thought: 'I should search for up-to-date information first.'
Tool_1: 'search'   Args: query='…'
```

This is `print()` to stdout, not the `logging` module, and there is no flag to
turn it off today.
