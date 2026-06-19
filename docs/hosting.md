# Hosting the dashboard server

The `minion-ui` server receives traces, stores them, and serves the dashboard at
**port 7337**. This guide covers running it with Docker (recommended) or directly
with uvicorn, on either SQLite or PostgreSQL.

> Replace `ghcr.io/shriyansnaik/minion-ui:latest` below with your own published
> image (see [publishing-the-image.md](publishing-the-image.md)). If you'd rather
> build from the repo source instead of pulling a published image, use the
> compose files at the **repo root** (`docker-compose*.yml`) — they say `build: .`
> instead of `image:`.

---

## Option A — SQLite (simplest)

One container, one file. Good for a small team or a single host. Traces persist
in a named volume mounted at `/root/.minion`.

`docker-compose.yml`:

```yaml
services:
  minion-ui:
    image: ghcr.io/shriyansnaik/minion-ui:latest
    ports:
      - "7337:7337"
    volumes:
      - minion_data:/root/.minion

volumes:
  minion_data:
```

```bash
docker compose up -d
```

Open **http://localhost:7337**.

Or without compose:

```bash
docker run -d -p 7337:7337 -v minion_data:/root/.minion \
  ghcr.io/shriyansnaik/minion-ui:latest
```

---

## Option B — PostgreSQL container

For heavier / multi-user use. Two containers: the dashboard and a Postgres
database. The dashboard switches to Postgres purely via the `DATABASE_URL`
environment variable.

`docker-compose.postgres.yml`:

```yaml
services:
  minion-ui:
    image: ghcr.io/shriyansnaik/minion-ui:latest
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
docker compose -f docker-compose.postgres.yml up -d
```

> Change `POSTGRES_PASSWORD` (and the matching password in `DATABASE_URL`) before
> exposing this anywhere real.

---

## Option C — Managed PostgreSQL (RDS / Supabase / Neon / …)

Run only the dashboard container and point it at your managed database. No `db`
service needed.

`docker-compose.managed-postgres.yml`:

```yaml
services:
  minion-ui:
    image: ghcr.io/shriyansnaik/minion-ui:latest
    ports:
      - "7337:7337"
    environment:
      - DATABASE_URL=postgresql://user:pass@mydb.us-east-1.rds.amazonaws.com:5432/minion
```

```bash
docker compose -f docker-compose.managed-postgres.yml up -d
```

A bare `postgresql://` URL is automatically routed through the psycopg (v3)
driver — paste the connection string your provider gives you as-is.

---

## Option D — Without Docker

```bash
pip install minion-ai

# SQLite (default path ~/.minion/traces.db):
uvicorn minions.server.app:app --host 0.0.0.0 --port 7337

# Postgres:
DATABASE_URL=postgresql://user:pass@host:5432/minion \
  uvicorn minions.server.app:app --host 0.0.0.0 --port 7337
```

`minion-ai` ships with FastAPI, uvicorn, and the Postgres driver out of the box.
(For a quick local viewer over a local SQLite file, `minion ui` also works — see
[remote-tracing.md](remote-tracing.md#local-mode).)

---

## Configuration reference

| Variable | Effect |
|---|---|
| `DATABASE_URL` *(unset)* | SQLite at `/root/.minion/traces.db` (default) |
| `DATABASE_URL=sqlite:////path/to/file.db` | SQLite at that path |
| `DATABASE_URL=postgresql://user:pass@host:5432/db` | PostgreSQL |
| `MINION_DB_PATH=/path/to/file.db` | SQLite path override (ignored if `DATABASE_URL` is set) |

- **Port:** the server listens on `7337`. Map a different host port with e.g. `-p 8080:7337`.
- **Data:** SQLite lives under `/root/.minion` — mount a volume there so it
  survives restarts. Postgres data lives in its own volume / managed service.
- **Migrations** run automatically on startup, on both SQLite and Postgres — no
  manual step. Upgrading the image and restarting applies any new schema changes
  without losing data.

---

## After it's running

Create a project in the dashboard, then generate an API token for it under
**the project → ⚙️ Settings → API Tokens**. Hand that token to your agents — see
[remote-tracing.md](remote-tracing.md#remote-mode).

---

## Updating to a new version

When a new image is published, update the dashboard from the folder with your
`docker-compose.yml`:

```bash
docker compose pull          # fetch the new image (this step is required!)
docker compose up -d         # recreate the container with it
```

Or in one step: `docker compose up -d --pull always`.

> **Gotcha:** `docker compose up -d` on its own will **not** download a newer
> image if it already has one cached locally — you must `docker compose pull`
> first. Plain `docker run` users likewise need `docker pull` before re-running.

Notes:

- This pulls the newest image only if your compose uses a moving tag like
  `image: ghcr.io/shriyansnaik/minion-ui:latest`. If you pinned a specific version
  (e.g. `:0.1.2`), bump it to the new version in the compose file first.
- **Your data is preserved.** Traces live in the Postgres volume (or your managed
  database), which survives `pull` / `up` / `down`. Only `docker compose down -v`
  deletes it.
- **Schema changes apply automatically.** On startup the new image runs its
  Alembic migrations, so upgrades that add tables/columns/indexes take effect
  in place without losing existing traces.

To pin to an exact version instead of tracking `latest`, set the version tag in
your compose file and update it deliberately when you want to move:

```yaml
    image: ghcr.io/shriyansnaik/minion-ui:0.1.3
```

### Updating the agent library

Separately, machines running agents update the Python package on their own:

```bash
pip install --upgrade minion-ai      # or pin: pip install minion-ai==0.1.3
```

The dashboard image and the `minion-ai` library version independently — update
whichever a given machine uses.
