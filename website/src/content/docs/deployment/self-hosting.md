---
title: Self-hosting the server
description: Run the minion-server container on SQLite or Postgres, and keep it updated.
sidebar:
  order: 2
---

The `minion-server` container receives traces, stores them, and serves the
dashboard on **port 7337**. Everything below uses the same image; only
`DATABASE_URL` changes.

Read [Choosing a database](/deployment/choosing-a-database/) first if you
haven't decided between SQLite and Postgres.

## Option A — SQLite

One container, one file. Traces persist in a named volume mounted at
`/root/.minion`.

```yaml title="docker-compose.yml"
services:
  minion-server:
    image: shriyansnaik/minion-server:latest
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

Open <http://localhost:7337>. Without compose:

```bash
docker run -d -p 7337:7337 -v minion_data:/root/.minion \
  shriyansnaik/minion-server:latest
```

## Option B — Postgres container

Two containers. The dashboard switches to Postgres purely via `DATABASE_URL`.

```yaml title="docker-compose.postgres.yml"
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
docker compose -f docker-compose.postgres.yml up -d
```

:::caution
Change `POSTGRES_PASSWORD` — and the matching password in `DATABASE_URL` —
before this touches anything real.
:::

## Option C — Managed Postgres

RDS, Supabase, Neon, and friends. Only the dashboard container runs; there's no
`db` service.

```yaml title="docker-compose.managed-postgres.yml"
services:
  minion-server:
    image: shriyansnaik/minion-server:latest
    ports:
      - "7337:7337"
    environment:
      - DATABASE_URL=postgresql://user:pass@mydb.us-east-1.rds.amazonaws.com:5432/minion
```

Paste the connection string your provider gives you as-is — a bare
`postgresql://` URL is routed through psycopg 3 automatically.

## Option D — Without Docker

```bash
pip install minion-ai

# SQLite (default ~/.minion/traces.db):
uvicorn minions.server.app:app --host 0.0.0.0 --port 7337

# Postgres:
DATABASE_URL=postgresql://user:pass@host:5432/minion \
  uvicorn minions.server.app:app --host 0.0.0.0 --port 7337
```

`minion-ai` bundles FastAPI, uvicorn and the Postgres driver. For a quick local
viewer over a local file, `minion serve` does the same thing with less typing.

## Configuration

| Variable | Effect |
| --- | --- |
| *(none set)* | SQLite at `/root/.minion/traces.db` |
| `DATABASE_URL=sqlite:////path/to/file.db` | SQLite at that path |
| `DATABASE_URL=postgresql://user:pass@host:5432/db` | PostgreSQL |
| `MINION_DB_PATH=/path/to/file.db` | SQLite path override — ignored when `DATABASE_URL` is set |

- **Port** — the server listens on `7337`. Map a different host port with
  `-p 8080:7337`.
- **Data** — SQLite lives under `/root/.minion`; mount a volume there or it
  vanishes on restart. Postgres data lives in its own volume or managed service.
- **Migrations** run automatically at startup on both dialects. Upgrading the
  image and restarting applies new schema changes in place, without losing data.

## Security

The server has **no authentication on the dashboard or the read endpoints.**
Only trace *ingest* requires a token. Anyone who can reach port 7337 can read
every trace — including inputs, outputs and system prompts — and delete them.

So: keep it on a private network or behind your own reverse proxy with auth
(OAuth proxy, VPN, IP allowlist, mTLS — whatever you already run). Do not put it
on a public IP. Authentication on the read endpoints is on the roadmap; it isn't
there today.

Traces contain whatever your agents saw. If that includes personal or regulated
data, the trace database inherits those obligations.

## After it's running

Create a project in the dashboard, then generate a token for it under **the
project → ⚙️ Settings → API Tokens**. Hand that token to your agents — see
[Remote tracing](/deployment/remote-tracing/).

## Updating

```bash
docker compose pull      # fetch the new image — this step is required
docker compose up -d     # recreate the container with it
```

Or in one step: `docker compose up -d --pull always`.

:::caution
`docker compose up -d` on its own will **not** download a newer image if one is
already cached locally. You must `docker compose pull` first. Plain `docker run`
users likewise need `docker pull`.
:::

Notes:

- This only fetches a newer build if your compose file uses a moving tag like
  `:latest`. If you pinned `:0.1.3`, bump the tag first.
- **Your data is preserved.** Traces live in the volume or managed database,
  which survives `pull` / `up` / `down`. Only `docker compose down -v` deletes
  it.
- **Schema changes apply automatically** via Alembic at startup.

To pin a version deliberately:

```yaml
    image: shriyansnaik/minion-server:0.1.3
```

### Updating the library separately

Machines running agents update the Python package on their own schedule:

```bash
pip install --upgrade minion-ai      # or pin: pip install minion-ai==0.1.3
```

The image and the library version independently. Keep them within a release or
two of each other; the ingest API is versioned by convention, not by contract.
