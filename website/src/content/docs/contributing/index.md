---
title: Contributing
description: Repo layout, the dev loop, migrations, and the conventions worth knowing before you open a PR.
---

The repo is small on purpose. This page is the map.

```bash
git clone https://github.com/shriyansnaik/minion-ai
cd minion-ai
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
```

## Repo layout

| Path | What lives there |
| --- | --- |
| `minions/minion.py` | The agent loop, the base prompt, tool parsing and invocation |
| `minions/models.py` | `Tool`, `ToolCall`, `MinionOutput`, `RunResult` — the structured-output schema |
| `minions/config.py` | `init()` and process-wide config |
| `minions/tracing.py` | `RunTracer` — every tracing side effect for one run |
| `minions/trace_db.py` | Storage: SQLite/Postgres writes and remote push |
| `minions/structured_output.py` | Getting the output envelope out of a model — native schema vs prompted fallback |
| `minions/costs.py` | Price-table lookup and cost estimation |
| `tests/` | Offline tests, plus the live Tier 1 smoke gate |
| `minions/cli.py` | The `minion` command |
| `minions/server/app.py` | FastAPI app — dashboard API and trace ingest |
| `minions/migrations/versions/` | Alembic migrations |
| `ui/` | The dashboard's React source (Vite) |
| `website/` | This site (Astro + Starlight) |
| `docs/` | Pointers to this site, plus maintainer-only runbooks |

Two boundaries are worth preserving:

- **The agent loop only talks to `RunTracer`.** Config lookup, database writes
  and token bookkeeping stay out of `minion.py`. If you're adding a field to a
  trace, it goes through the tracer.
- **A `Minion` holds only immutable config.** Per-run state lives in the `_Run`
  object created inside `__call__`. This is what makes a minion thread-safe and
  reusable as a specialist — don't add mutable attributes to `Minion`.

## Tests

```bash
python tests/test_structured_output.py     # no dependencies
python -m pytest tests/                    # or, if you have pytest
```

`tests/test_structured_output.py` monkeypatches `litellm.completion`, so it
makes **no API calls and costs nothing**. Every test in `tests/` must stay that
way — the one exception is `tests/smoke_providers.py`, which is a live Tier 1
gate that refuses to run without an explicit
`--i-understand-this-spends-money` flag, and is run by hand before a release.

Coverage is thin. Tool parsing, argument coercion, and the price lookup all need
tests and none of them need an API key.

## The dev loop

**Library changes** — `pip install -e .` and run a script, plus the tests above.

**Dashboard changes** need two terminals:

```bash
minion serve            # terminal 1 — API on :7337
cd ui && npm run dev    # terminal 2 — Vite on :5173, proxies /api to :7337
```

Use **:5173** while editing. Then:

```bash
cd ui && npm run build
```

The build output is what `minion serve` actually serves — skip it and your
change won't appear outside the dev server. The built bundle is gitignored and
produced by CI at release time.

**Website changes:**

```bash
cd website
npm install
npm run dev             # :4321
```

The changelog page is generated from the repo's `CHANGELOG.md` on every `dev`
and `build`. Edit `CHANGELOG.md`, never `website/src/content/docs/changelog.md`.

## Database migrations

Schema changes go through Alembic, in `minions/migrations/versions/`. Migrations
run automatically at server startup on both SQLite and Postgres.

**Migrations must be additive.** Adding a table, a column, or an index is safe
and never loses data. Dropping or renaming a column would destroy traces on
someone's running server. If a column has to change shape, add the new one,
backfill, and leave the old one.

Both dialects have to work. Postgres-only syntax needs a dialect check — see how
`metadata` is cast to `jsonb` on Postgres and left as text on SQLite in
`trace_db.create_run`.

## Conventions

**Errors in tools are returned, not raised.** `demo_tools` demonstrates the
pattern and exists to be read and copied. See
[Tools](/guides/tools/#return-errors-dont-raise-them).

**Tracing must never raise.** Every trace write is wrapped and degrades to a
logged warning. The one exception is `init()`, which validates up front because
that class of failure is otherwise silent forever.

**Console output is ASCII.** Windows consoles default to the cp1252 codepage,
where a `→` in a `print()` crashes the command with `UnicodeEncodeError` before
anything runs. This has bitten the project once already.

**Comments explain why, not what.** The existing code is consistent about this;
match it.

## Things that would help

Roughly in order of usefulness:

- **More tests.** `tests/` only covers the structured-output paths so far. Tool
  parsing, argument coercion, and the price lookup are all testable without an
  API key.
- **Tier 2 provider reports.** Ran Minion on a model not in
  [the table](/reference/providers/)? Say whether it worked. Both answers are
  useful.
- **Cookbook recipes.** A complete, runnable program that solves one real task.
- **Docs fixes.** Every page has an "Edit page" link.

## Opening a PR

Branch off `main`, keep the change focused, and add a line to the `[Unreleased]`
section of `CHANGELOG.md` describing it from a user's point of view — that entry
becomes the public changelog verbatim.

If the change affects behaviour someone could be relying on, mark it
`**Breaking:**` and say what to change.
