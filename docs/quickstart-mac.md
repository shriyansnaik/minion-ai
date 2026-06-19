# Quickstart — Mac (Apple Silicon, e.g. M4)

A complete walkthrough: run the dashboard (backed by PostgreSQL in Docker), then
run a traced agent and watch its traces show up. Everything runs on your Mac.

> These steps are the same on Intel Macs, Windows, and Linux — only the Docker
> Desktop install differs. The `minion-ui` image is multi-architecture, so your
> M4 automatically pulls the `arm64` build; you don't have to think about it.

You'll need an LLM API key (e.g. OpenAI) for the agent to actually run.

---

## 1. Install the prerequisites

- **Docker Desktop** — https://www.docker.com/products/docker-desktop/ (Apple
  Silicon build). Launch it once so the whale icon shows "running".
- **Python 3.10+** — `python3 --version`.

---

## 2. Start the dashboard with PostgreSQL

Make an empty folder and create one file in it:

`docker-compose.yml`
```yaml
services:
  minion-ui:
    image: shriyansnaik/minion-ui:latest
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

Start it:
```bash
docker compose up -d
```

The first run pulls the images (a moment). Then open **http://localhost:7337** —
you should see the (empty) Minions dashboard. No source code or build needed; the
image is pulled from Docker Hub, just like `pip install`.

---

## 3. Create a project and an API token

In the dashboard:

1. Click **New project** → name it `demo`.
2. Open the project, click the **⚙️ gear** (top right) → **API Tokens**.
3. Click **Create token**, name it (e.g. `laptop`), and **copy the token now** —
   it's shown only once. It looks like `mni_xK9mP2...`.

---

## 4. Install the library

```bash
pip install minion-ai
```

Set your LLM provider key:
```bash
export OPENAI_API_KEY="sk-..."
```

---

## 5. Run a traced agent

`demo.py` (paste your token):
```python
import minions

minions.init(
    tracing=True,
    project="demo",                              # must match the project the token belongs to
    trace_url="http://localhost:7337",           # the dashboard you started in step 2
    tracing_secret_token="mni_xK9mP2...",        # the token from step 3
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

Run it:
```bash
python demo.py
```

In remote mode nothing is written locally — the run is pushed over HTTP to the
dashboard (and stored in Postgres). If the dashboard were down, the agent would
still run; tracing just gets skipped.

---

## 6. View the trace

Refresh **http://localhost:7337**, open the `demo` project, and you'll see the
run. Click it to drill into each turn, the tool call (`add`), token usage, and
cost.

To prove it's really in Postgres, you can peek at the database:
```bash
docker compose exec db psql -U minion -d minion -c "select id, model, status from runs;"
```

---

## Stopping & cleanup

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop and delete the Postgres volume (wipes traces)
```

---

## Later: a managed Postgres (RDS / Supabase / Neon)

Same image, no `db` container — just point `DATABASE_URL` at the managed database.
Replace the whole `docker-compose.yml` with:

```yaml
services:
  minion-ui:
    image: shriyansnaik/minion-ui:latest
    ports:
      - "7337:7337"
    environment:
      - DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
```

Use the connection string your provider gives you (paste it as-is — a bare
`postgresql://` URL is handled automatically). Everything else — the agent code,
tokens, dashboard — is identical.

---

## If something's off

| Symptom | Fix |
|---|---|
| Dashboard won't load | Is Docker running? `docker compose ps` should show both services `up`/`healthy`. |
| `403` when running the agent | The `project` in `init()` doesn't match the token's project. |
| `401` when running the agent | Token is wrong or revoked — make a new one. |
| Agent errors before any trace | LLM key not set / wrong model name. |
| `db` keeps restarting | Port/volume conflict — try `docker compose down -v` then up. |
