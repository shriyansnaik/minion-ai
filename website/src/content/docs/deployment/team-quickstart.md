---
title: Team quickstart
description: End to end in ten minutes — a Postgres-backed dashboard in Docker, a token, and an agent pushing traces to it.
sidebar:
  order: 4
---

The fastest way to see the whole system working: a shared dashboard on Postgres,
and an agent pushing traces to it over HTTP. Everything runs on one machine, but
nothing about it is local-only — move the container to a server and the same
steps hold.

The steps are identical on macOS, Windows and Linux; only the Docker install
differs. The image is multi-architecture, so Apple Silicon pulls `arm64`
automatically.

You'll need Docker, Python 3.10+, and an LLM API key.

## 1. Start the dashboard

Make an empty folder with one file in it:

```yaml title="docker-compose.yml"
services:
  minion-server:
    image: shriyansnaik/minion-server:latest
    ports:
      - "7337:7337"
    environment:
      - DATABASE_URL=postgresql://minion:secret@db:5432/minion
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=minion
      - POSTGRES_USER=minion
      - POSTGRES_PASSWORD=secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U minion"]
      interval: 5s
      retries: 5

volumes:
  pg_data:
```

```bash
docker compose up -d
```

The first run pulls both images. Then open <http://localhost:7337> — an empty
dashboard. No source, no build; the image comes from Docker Hub the same way
`pip install` gets the library.

:::caution
Change `POSTGRES_PASSWORD`, and the matching password in `DATABASE_URL`, before
this runs anywhere but your laptop.
:::

## 2. Create a project and a token

In the dashboard:

1. **New project** → name it `demo`.
2. Open it, click the **⚙️ gear** → **API Tokens**.
3. **Create token**, name it (`laptop`), and **copy it now** — it's shown once.
   It looks like `mni_xK9mP2…`.

## 3. Point an agent at it

```bash
pip install minion-ai
export OPENAI_API_KEY="sk-..."
```

```python title="demo.py"
import minions

minions.init(
    tracing=True,
    project="demo",                        # must match the token's project
    trace_url="http://localhost:7337",     # the dashboard from step 1
    tracing_secret_token="mni_xK9mP2...",  # the token from step 2
)

def add(a: int, b: int) -> int:
    """Add two numbers.

    Args:
        a: The first number.
        b: The second number.
    """
    return a + b

agent = minions.Minion(model="openai/gpt-4o", tools=[add])
print(agent("What is 21 + 21? Use the tool."))
```

```bash
python demo.py
```

Nothing is written locally in this mode — the run is pushed over HTTP and stored
in Postgres. If the dashboard were down, the agent would still run and answer;
tracing would just be skipped.

## 4. Read the trace

Refresh <http://localhost:7337>, open `demo`, and click the run. You'll see the
turn, the `add` tool call with its arguments and result, token usage, and cost.

To prove it really is in Postgres:

```bash
docker compose exec db psql -U minion -d minion -c "select id, model, status from runs;"
```

## 5. Add teammates

Each machine needs the same three things: `pip install minion-ai`, the
`trace_url`, and **its own token**. One token per deployment rather than one per
team — revocation is then surgical. See
[Remote tracing](/deployment/remote-tracing/#managing-tokens).

For anything beyond a trusted network, put the server behind your own auth
first: the dashboard and read endpoints are **unauthenticated**, so anyone who
can reach port 7337 can read and delete every trace. See
[Security](/deployment/self-hosting/#security).

## Cleanup

```bash
docker compose down       # stop, keep data
docker compose down -v    # stop and delete the volume — wipes every trace
```

## Moving to managed Postgres

Same image, no `db` service — point `DATABASE_URL` at RDS / Supabase / Neon:

```yaml
services:
  minion-server:
    image: shriyansnaik/minion-server:latest
    ports:
      - "7337:7337"
    environment:
      - DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Paste the connection string as-is. Agent code, tokens and dashboard are
identical.

## If something's off

| Symptom | Fix |
| --- | --- |
| Dashboard won't load | Is Docker running? `docker compose ps` should show both services up/healthy |
| `ValueError` at startup about the token's project | The `project` in `init()` doesn't match the token's project |
| `ValueError` at startup about an invalid token | Token wrong or revoked — create a new one |
| Agent errors before any trace appears | LLM key not set, or a model that can't do structured output — see [Provider support](/reference/providers/) |
| `db` keeps restarting | Port or volume conflict — `docker compose down -v`, then up |
