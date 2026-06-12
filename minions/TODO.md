# Minions — TODO

---

## 1. Provider Agnostic (LiteLLM)

**Problem:** Right now the code calls `client.responses.parse(...)` which is OpenAI's Responses API.
Other providers (Anthropic, Gemini, Mistral, etc.) do not have this API, so swapping the provider is not just swapping the key — it requires changing the call itself.

**Solution:** Use [LiteLLM](https://github.com/BerriAI/litellm) as an abstraction layer.
LiteLLM wraps every major provider behind one unified interface.

**What needs to change:**
- Replace `client.responses.parse(...)` with a LiteLLM call
- LiteLLM has structured output support via `response_format` — use that instead of `text_format`
- `minions.init()` would accept `provider` or just let the model string carry it (LiteLLM style: `"anthropic/claude-opus-4"`, `"gemini/gemini-2.5-pro"`)
- Drop the custom `get_client()` — LiteLLM handles the client internally

**New init signature:**
```python
minions.init(api_key="...", model_prefix="anthropic")
# or just pass model strings like "anthropic/claude-opus-4" to Minion directly
```

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

## 3. Package Setup (pip installable)

- [ ] Add `pyproject.toml` (or `setup.py`)
- [ ] Decide package name (e.g. `minions-ai`)
- [ ] Publish to PyPI
- [ ] `minions[ui]` optional dependency group for FastAPI + uvicorn
- [ ] `minions ui` CLI command to start the UI server locally without Docker
