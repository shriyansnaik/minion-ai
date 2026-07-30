# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

- Add `parallel_tools=True` to run a turn's tool calls concurrently; each call is now timed independently so latencies stay accurate under parallelism
- Show per-turn cost in the trace viewer, computed the same way as the run total so turns sum back to it
- **Breaking:** rename the CLI command `minion ui` → `minion serve`. The old name is removed, not aliased — it named the technology rather than the job, and the dashboard now covers traces, analytics and (soon) evals
- **Breaking:** rename the Docker image and compose service `minion-ui` → `minion-server`. Update `image:` to `shriyansnaik/minion-server` (or `ghcr.io/shriyansnaik/minion-server`); the old `minion-ui` tags are no longer updated
- Fix `minion serve` crashing with `UnicodeEncodeError` on Windows consoles using the cp1252 codepage
- Add `ROADMAP.md` (feature list and release phases) and `docs/providers.md` (tiered provider support; Minion requires models with native JSON-schema structured output)
- Trace viewer: path-style URLs (`/project/<id>/trace/<id>`), model/metadata/date-range filters, ascending/descending sort, keyset-paginated trace list, and batch delete (selected rows or all matching the current filter)
- Add database indexes on `runs` and migrate `metadata` to JSONB+GIN on Postgres for efficient filtering; metadata values are now stored as strings (see `Minion.__call__` docstring)
- Fix date-range filter excluding most of the "to" day when no end time was set; support chaining multiple metadata filters (AND)
- Add specialist `sub_minions` and make `Minion` runs thread-safe
- Only include the spawn-sub-minion prompt section when `allow_sub_agents` is set
- Validate project/token match at `init()` instead of failing silently
- Return errors as strings instead of raising in `demo_tools`

## [0.1.3] - 2026-06-19

- Capture and surface errors on failed runs
- Merge UI extras into core package
- Add coming soon website
- Bump workflow actions to Node 24 versions; add release runbook doc
- docs: add Updating section to hosting guide

## [0.1.2] - 2026-06-16

- Add trace observability: local + remote tracing, dashboard, Postgres, Docker
- Migrate to LiteLLM, rename tools to `demo_tools`, enhance README
- Add PyPI publish workflow (Trusted Publishing) and docs
- Bundle UI build and price table in sdist too (global hatch artifacts)

## [0.1.1]

- Rename to Minion AI
- Add `minions` package, `pyproject.toml`, and project scaffolding
