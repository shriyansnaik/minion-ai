# Minions — TODO

---

## ~~1. Provider Agnostic (LiteLLM)~~

- [x] Replace `client.responses.parse(...)` with `litellm.completion()`
- [x] Structured output via `response_format`
- [x] Model string carries the provider (`"anthropic/claude-opus-4"`, `"openai/gpt-4o"`, etc.)
- [x] Drop `client.py` — LiteLLM handles the client internally
- [x] `init()` sets `litellm.api_key` and `litellm.api_base` globally; env vars work too

---

## 2. Observability UI (minions-ui)

A separate open source Docker app that shows traces from all Minion runs.

### Architecture
```
FastAPI backend  ←  Minion posts traces here after each run
SQLite database  ←  FastAPI stores traces as JSON
React frontend   ←  reads from FastAPI, renders trace tree
```

### How users run it
```bash
git clone https://github.com/you/minions-ui
cd minions-ui
docker compose up
# UI available at http://localhost:7337
```

### How users enable tracing in their code
```python
import minions
minions.init(api_key="...", tracing=True, ui_url="http://localhost:7337")
```

### What the UI shows
- List of all runs (left panel) — timestamp, model, first user message
- Trace tree (right panel) for selected run:
  - User input
  - Each turn: thought → tool calls (with args) → tool outputs
  - Sub-minion runs nested under the parent
  - Final answer
  - Token usage + latency per turn

### What needs to be built
- [ ] `Minion.to_trace()` — serializes conversation + raw_model_responses to a JSON blob
- [ ] POST to `ui_url/api/traces` after `_finish` is called
- [ ] FastAPI app with two endpoints: `POST /api/traces`, `GET /api/traces`, `GET /api/traces/{id}`
- [ ] SQLite schema: `id`, `timestamp`, `model`, `input`, `trace_json`
- [ ] React app (Vite + React, no UI kit) with run list + trace tree
- [ ] Dockerfile + docker-compose.yml

---

## ~~3. Package Setup (pip installable)~~

- [x] Add `pyproject.toml`
- [x] Decide package name → `minion-ai`
- [x] Publish to PyPI
- [ ] `minions[ui]` optional dependency group for FastAPI + uvicorn
- [ ] `minions ui` CLI command to start the UI server locally without Docker
