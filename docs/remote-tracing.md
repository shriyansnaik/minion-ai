# Connecting your agent

Tracing is configured once, in `minions.init(...)`, before you create any agent.
There are two modes: write to a **local file**, or **push to a remote server**.

---

## Local mode

Traces are written to a local SQLite file (`~/.minion/traces.db` by default).

```python
import minions

minions.init(
    tracing=True,
    project="my-project",   # required when tracing=True
)

agent = minions.Minion(model="openai/gpt-4o", tools=[...])
agent("Do something")
```

View them with the bundled local dashboard:

```bash
pip install "minion-ai[ui]"
minion ui            # opens http://localhost:7337
```

Options: `minion ui --port 7337 --db-path /path/to/traces.db`.

---

## Remote mode

Traces are pushed over HTTP to a [hosted dashboard server](hosting.md). Nothing
is written locally.

```python
import minions

minions.init(
    tracing=True,
    project="my-project",
    trace_url="https://traces.mycompany.com",   # your minion-ui server
    tracing_secret_token="mni_xK9mP2...",        # project-scoped token
)
```

Just installing `minion-ai` is enough for remote push — you do **not** need the
`[ui]` extra on the agent machine.

### Getting a token

1. Open the dashboard and create (or open) the project.
2. Go to **the project → ⚙️ Settings → API Tokens → Create token**.
3. Copy the token immediately — it's shown **once** and only its hash is stored.

The token is scoped to that one project. The `project` you pass to `init()` must
match the project the token belongs to, or the server rejects the push with a
**403**.

### Reliability

Tracing never crashes your agent. If the server is unreachable, slow, or returns
an error, the push is skipped (a warning is logged) and the agent keeps running.

---

## `init()` parameters

| Parameter | Required | Purpose |
|---|---|---|
| `tracing` | — | Set `True` to record traces |
| `project` | when `tracing=True` | Groups traces; in remote mode must match the token's project |
| `trace_url` | for remote mode | The dashboard server URL |
| `tracing_secret_token` | for remote mode | Project-scoped token (`mni_…`) |
| `db_path` | optional (local only) | Override the local SQLite path |

Validation: `trace_url` and `tracing_secret_token` must be set together, and both
require `tracing=True` with a `project`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `403` in logs | The `project` in `init()` doesn't match the token's project |
| `401` in logs | Token is wrong, revoked, or missing |
| Connection / timeout warning | The `trace_url` server is unreachable (agent still runs) |
| `ValueError` on startup | `trace_url`/token set without the other, or without `tracing`/`project` |
