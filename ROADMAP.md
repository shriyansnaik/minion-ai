# Minion — Feature List & Roadmap

Single source of truth for what's built and what's next. `[x]` = shipped and in
`main`, `[~]` = partially done, `[ ]` = not started.

Release history lives in [CHANGELOG.md](CHANGELOG.md). Internal scaling notes
live in `TODO.md` (gitignored).

---

## ⏭️ Start here — next actions

*Read this first after time away. One item at a time, in this order.*

**How to run the project**

```bash
minion serve          # dashboard + API together, http://localhost:7337
```

That's the whole thing — one command. The server ships a pre-built React bundle at
`minions/server/ui/dist`. You only need two terminals when *editing* the UI and
wanting hot reload: `minion serve` in one, `cd ui && npm run dev` in the other, then
use **:5173** (vite proxies `/api` to 7337). After editing UI source, run
`cd ui && npm run build` or the change won't appear under `minion serve`.

**The queue**

1. **Pick a domain and deploy the site.** `website/` is a full Astro + Starlight
   site now (`cd website && npm install && npm run dev`). Two things are stubbed
   on a placeholder: `SITE_URL` in `astro.config.mjs`, and every
   `https://minion-ai.vercel.app` link in `README.md` / `docs/README.md`. Set the
   real domain, then `vercel deploy`.
2. **Record the demo video.** Only Shriyans can. Drop the embed URL into
   `DEMO_VIDEO_EMBED_URL` in `website/src/config.ts` and it replaces the hero
   placeholder; add a GIF near the top of `README.md` at the marked comment.
3. **Verify the Tier 3 fallback against a live model.** Implemented and covered
   by offline tests, but never run against a real `groq/llama-3.3-70b-versatile`.
   Cheap on Groq — worth doing before the claim ships.
4. **Run the Tier 1 smoke test.** `tests/smoke_providers.py` is written and
   dry-run clean. Needs paid keys; see the deferred note below.
5. **Fix the one-level delete cascade** — a known data-integrity bug, small,
   detailed under "Bugs found while writing the docs" below. Deleting a run
   orphans its *grandchild* sub-runs, which then skew analytics forever.
6. Tag and publish v0.2.0.

**Deliberately deferred to immediately pre-launch**

Both are last-mile on purpose, not forgotten:

- **Tier 1 provider testing.** Shriyans will top up OpenAI / Anthropic / Gemini with
  ~$5 each shortly before launch; finances are tight right now, so this is the final
  gate. **Launch does not happen until all three Tier 1 providers pass.** For all
  development testing until then, use `groq/openai/gpt-oss-120b` — effectively free.
  The script can be written and reviewed ahead of time; just don't run it.
- **Demo video.** Recorded last so it shows the finished pre-launch product — every
  feature and rename included — rather than needing a re-shoot. Only Shriyans can do
  this. It gates the website hero and the README top.

**Gotchas that cost time before**

- `.env` names the Groq key `GROQ_API_KEY_1`; LiteLLM needs exactly `GROQ_API_KEY`.
- The `OPENAI_API_KEY` in `.env` is rejected as invalid — replace it before testing.
- `python -m minions.cli` does nothing (no `__main__` guard). Use the `minion` script.
- **Ask before making any LLM API call** — Shriyans approves spend first.

---

## Shipped

### Core agent framework
- [x] Think → act → observe loop with typed structured output (`MinionOutput`)
- [x] Tools from plain Python functions (docstring + type hints → schema)
- [x] `_finish` tool as the explicit termination signal
- [x] `max_turns` cap
- [x] Generic sub-agents (`allow_sub_agents=True`, `secondary_model` for cheap workers)
- [x] Named specialist sub-agents (`sub_minions=[...]`)
- [x] Thread-safe runs (no shared mutable state across concurrent `__call__`s)
- [x] Parallel tool execution within a turn (`parallel_tools=True`)
- [x] Provider-agnostic via LiteLLM (OpenAI, Anthropic, Gemini, Groq, …)
- [x] Custom endpoints (`base_url`) — Azure, vLLM, any OpenAI-compatible API
- [x] Errors returned as strings rather than raised, in `demo_tools`

### Observability
- [x] Local tracing to SQLite (`init(tracing=True)`)
- [x] Remote tracing to a shared server (`trace_url` + project-scoped `mni_` token)
- [x] Tracing never raises — unreachable server degrades to a skipped push
- [x] Run / turn / tool-call hierarchy, with sub-agent traces nested under parents
- [x] Per-tool-call latency (each call timed independently, correct under parallelism)
- [x] Per-turn and per-run cost estimation (turns sum back to the run total)
- [x] Token accounting (input / output / total)
- [x] Error capture and surfacing on failed runs
- [x] Alembic migrations (additive — upgrades never lose data)

### Dashboard (`minion serve`)
- [x] Project grouping and project switcher
- [x] Trace list with drill-down into every turn and tool call
- [x] Filters: status, model, metadata key=value (chainable), date range, search
- [x] Sort ascending/descending, keyset pagination
- [x] Batch delete (selected rows, or everything matching the current filter)
- [x] Path-style URLs (`/project/<id>/trace/<id>`) — shareable/deep-linkable
- [x] Analytics: spend, tokens, latency, success rate, daily + by-model rollups
- [x] Custom per-project model prices; built-in price table for 145 models
- [x] API token management in the UI
- [x] DB indexes on `runs`; `metadata` as JSONB + GIN on Postgres

### Distribution
- [x] `pip install minion-ai`, PyPI Trusted Publishing workflow
- [x] Docker image + compose files (SQLite, self-hosted Postgres, managed Postgres)
- [x] Documentation site (Astro + Starlight) in `website/`; `docs/` is a pointer
- [x] CHANGELOG following Keep a Changelog

---

## Phase 0 — Land what's already written  ·  target: v0.1.4

- [x] `parallel_tools` + per-tool-call latency + per-turn cost
- [x] Trace-viewer rework (`FilterPanel`, `DeleteModal`, `TraceDetail`)
- [x] Fix `minion serve` crashing on Windows cp1252 consoles (`UnicodeEncodeError` on `→`)
- [x] Committed to `main`
- [ ] ~~Tag and publish v0.1.4~~ — folded into v0.2.0; Phase 1 landed on top of it
      before a release was cut, so there is no separate 0.1.4

## Phase 1 — Launch blockers

Everything a stranger arriving from Product Hunt needs in order to succeed.

**Provider compatibility — stop claiming "works with everything"**
- [x] Tiered support model: Tier 1 supported (OpenAI/Anthropic/Gemini) · Tier 2
      should-work · Tier 3 not natively supported
- [x] Reword the README + website to the tiered claim instead of "provider-agnostic"
- [~] Smoke test across the three Tier 1 providers — `tests/smoke_providers.py` is
      **written and dry-run clean, not yet run live**. It refuses to run without
      `--i-understand-this-spends-money`. Launch is gated on all three passing.
- [~] Fallback for Tier 3 models: `structured_output="prompt"` — schema injected
      into the prompt + `json_object` + bounded reparse/retry. Implemented, 19
      offline tests pass. **Not yet verified against a live
      `groq/llama-3.3-70b-versatile`** — do that before the claim ships.
- [x] Groq pricing entries in `model_prices.json` (gpt-oss-120b/20b,
      llama-3.3-70b-versatile, llama-3.1-8b-instant)
- [x] Actionable `StructuredOutputError` when a model can't do structured output,
      instead of a raw LiteLLM `BadRequestError`

**Website — Astro + Starlight, in `website/`**
- [x] Landing page: what it is, code samples, install, provider tiers
- [ ] Demo video embedded above the fold  ← **needs Shriyans to record**; drop the
      URL into `DEMO_VIDEO_EMBED_URL` in `website/src/config.ts`. A CSS mock of the
      trace viewer stands in until then
- [x] Docs section (structure below)
- [x] Public changelog page, generated from `CHANGELOG.md` at build time
- [ ] Real screenshot of `minion serve` to replace the CSS mock
- [ ] Pick a domain, set `SITE_URL`, and deploy

**Docs — the main selling point, so treat them as a feature**

Target: someone who has never seen the project, or who last touched it a month ago,
can get productive from the docs alone. Applies to users *and* contributors.

- [x] **Getting started** — what it is, install, first agent, first trace
- [x] **Guides / usage** — tools, sub-agents & specialists, parallel tools,
      tracing & metadata, cost tracking, the dashboard
- [x] **Cookbook** — three complete runnable programs: changelog writer,
      codebase explainer, support triage
- [x] **Deployment** — choosing a database, self-hosting, remote tracing,
      team quickstart
- [x] **Reference** — `Minion(...)`, `init(...)`, CLI, provider support
- [x] **Contributing** — repo layout, dev loop, tests, migrations, releasing,
      publishing setup
- [x] Every code sample compiles; every cookbook tool function was executed
      against real inputs (with the LLM stubbed). **The end-to-end agent runs in
      the cookbook have not been executed live** — they need an API key

**README**
- [ ] Demo video / animated GIF near the top *(placeholder comment marks the spot)*
- [x] Trim to a scannable landing README; push depth into the docs site

**Naming**
- [x] `minion ui` → `minion serve` (clean rename, no alias — pre-1.0)
- [x] Docker image + compose service `minion-ui` → `minion-server`, everywhere
      (workflow, all three compose files, all docs). Done pre-launch deliberately:
      Docker Hub can't rename a repo in place, so the new name is created on next
      push and the orphaned `minion-ui:0.1.2/0.1.3` tags are simply left behind —
      harmless now, expensive after launch.
- [ ] **Manual step at next release:** the Docker Hub repo `shriyansnaik/minion-server`
      is created on first push. Check the description/README on the new repo, and
      consider marking the old `minion-ui` repo deprecated.
- [~] Name the dashboard surface itself, now that evals will live there too. The
      docs now say **"the dashboard"** throughout, and `minion serve` /
      `minion-server` for the thing that runs it. Consistent, but not a decision —
      revisit before evals ship if a better noun exists.

**Bugs found while writing the docs**
- [ ] **Delete cascades only one level.** `_cascade_delete_runs` in
      `minions/server/app.py` collects sub-runs whose `parent_trace_id` matches a
      deleted run, but doesn't recurse. A specialist that itself delegated leaves
      grandchild runs orphaned — invisible in the trace list (top-level only) but
      still counted in analytics totals. Documented honestly on the dashboard page
      meanwhile.

---

# 🚀 PUBLIC LAUNCH — Product Hunt, after Phase 1  ·  target: v0.2.0

Decided 2026-07-30: launch on the observability story alone — build agents, watch
every turn, know what it cost. Evals are the first big post-launch release rather
than a launch blocker, so the date doesn't slip and there's a second wave of
attention to spend later.

Launch checklist: Phase 1 complete · v0.2.0 on PyPI · website live · demo video
recorded · README polished · changelog page up.

---

## Phase 2 — Evaluations  ·  first post-launch release

The differentiator: traces you already collect become the eval dataset. Design
before building.

- [ ] Design note: dataset format, assertion API, where results live
- [ ] Define an eval case (input + expectations) and a suite
- [ ] Assertions: exact/contains, tool-was-called, JSON-path, LLM-as-judge
- [ ] Promote a real trace into an eval case, from the dashboard
- [ ] Run a suite from the CLI (`minion eval`) and from Python
- [ ] Store results in the same DB; eval view in the dashboard
- [ ] Compare runs across models/prompts (regression view)
- [ ] Docs + example suite

## Phase 3 — Scale & hardening

Not launch-blocking, but the first self-hoster with real volume will hit these.
Detail in `TODO.md`.

- [ ] Move `/api/analytics` aggregation into SQL (currently `SELECT *` + Python)
- [ ] Multiple uvicorn workers / replicas + SQLAlchemy pool tuning
- [ ] Reduce dashboard polling: idle backoff → ETag/`304` → SSE push
- [ ] Auth on the read/dashboard endpoints (only ingest is token-protected today)

## Phase 4 — Replay from turn

Re-run a recorded run from a chosen turn — the DB is already the source of truth.

- [ ] `minion.replay(trace_id, from_turn)`
- [ ] Replayed runs linked back to the original trace
- [ ] "Replay from here" affordance on each turn in the dashboard
- [ ] Edit-then-replay (tweak prompt/model/tool output, re-run from that point)

## Phase 5 — Memory layer

Deliberately last: the most complex piece, and explicitly not a release blocker.

- [ ] Design note: what's remembered, scope, retrieval, eviction
- [ ] Short-term: conversation compaction as runs grow past the context window
- [ ] Long-term: durable store with retrieval injected into instructions
- [ ] Per-agent vs per-project vs per-user memory scoping
- [ ] Memory reads/writes visible in the trace viewer
- [ ] Docs + examples
