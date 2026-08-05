---
title: Cost tracking
description: Where the dollar figures come from, why a run can show as unpriced, and how to add your own prices.
sidebar:
  order: 5
---

Every traced run and every turn carries an estimated cost. It's computed from
recorded token counts and a price table — no extra call, no provider billing
API.

```
cost = input_tokens × input_price + output_tokens × output_price
```

Run cost and turn cost use the **same** function over the same prices, so the
turns of a run always sum back to the run's total. If they didn't, neither
number would be trustworthy.

## The built-in price table

Minion ships a table covering **145 models** across OpenAI, Anthropic, Gemini,
Groq and others. Lookup is by pattern, and it tries two forms of the model
string:

1. the full string — `groq/openai/gpt-oss-120b`
2. the same string with the leading provider segment stripped — `openai/gpt-oss-120b`

So `openai/gpt-4o` and a bare `gpt-4o` both resolve to the same entry.

## Unpriced runs

If no entry matches, the cost is `None` rather than `0`. The dashboard shows the
run as **unpriced** and the analytics view flags that some totals are
incomplete.

This distinction matters: a zero would silently understate your spend, and a
dashboard that quietly under-reports cost is worse than one that admits it
doesn't know. A run shows as unpriced when:

- the model isn't in the table (a new release, a fine-tune, a self-hosted model),
- you're on a custom `base_url` with a model name the table can't match,
- your negotiated rate differs from list price.

The fix for all three is the same.

## Custom prices

Prices are set **per project**, in the dashboard: open the project → **⚙️
Settings → Model Prices → Add model**. Enter the model string exactly as it
appears on the trace, plus input and output price **per million tokens**.

A custom price takes priority over the built-in table for that project, so it's
also how you apply a negotiated discount or account for a cached-input rate.

Recomputation is immediate and retroactive: cost is derived at read time from
stored token counts, never frozen into the row. Add a price today and every
historical run of that model shows a cost. Correct a wrong price and every
affected run updates.

:::note
Custom prices are scoped to one project. The same model used in three projects
needs the price set in each — deliberate, since different teams often have
different rates.
:::

## Reading the numbers

In the dashboard's **Analytics** view:

| Metric | Counts |
| --- | --- |
| Total spend, tokens | **All** runs, including sub-agent runs |
| Run count, status breakdown, success rate | **Top-level** runs only |
| Daily rollup | Spend and tokens across all runs; run counts top-level only |
| By-model rollup | Every run, so a delegating agent shows both its manager and worker models |

That split is what you usually want: *how many jobs did we do* and *what did
they cost in total*, without a fan-out over 25 workers reading as 26 jobs.

The by-model table is the fastest way to see whether delegation is paying off —
if your `secondary_model` row shows most of the tokens and a small slice of the
cost, the cheap workers are doing their job.

## Cost is an estimate

Some deliberate limits, so the number is read correctly:

- **List prices, not your invoice.** Volume discounts, committed-use pricing and
  free tiers are not modelled. Override them per project if it matters.
- **Cached input isn't tracked separately.** Providers that discount repeated
  prompt prefixes will bill you *less* than the estimate.
- **Batch pricing isn't modelled.** Same direction — you'll be billed less.
- **Token counts come from the provider's `usage` field**, so they are as
  accurate as what the provider reports. If a provider returns no usage, the
  turn records zero tokens and contributes zero cost.

Treat it as a reliable relative signal — which agent, which model, which prompt
version is expensive — rather than an accounting record.

## Keeping costs down

The trace data usually points straight at the fix:

- **A `secondary_model` for sub-agents.** The largest single lever in a
  delegating agent. See [Sub-agents](/guides/sub-agents/#secondary_model).
- **Watch input tokens across turns.** Every tool result is re-sent on every
  later turn of a run. A tool returning a 200 KB blob is paid for repeatedly —
  trim what tools return.
- **Delegate instead of reading.** A manager that reads 12 files itself carries
  all 12 in context by the last turn; one that spawns 3 workers carries 3
  summaries.
- **Lower `max_turns`** on agents that shouldn't need many. It caps the worst
  case rather than the typical one, but the worst case is what surprises you.
