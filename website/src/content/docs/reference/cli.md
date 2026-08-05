---
title: CLI
description: The minion command — starting the dashboard, and where it reads traces from.
sidebar:
  order: 3
---

Installing `minion-ai` puts a single `minion` executable on your path.

```
minion serve [--port PORT] [--db-path PATH]   Start the dashboard server
minion --version                              Print the installed version
minion --help                                 Show usage
```

Running `minion` with no arguments is the same as `minion serve`.

## `minion serve`

Starts the dashboard and trace API.

```bash
minion serve
```

```
minion server  ->  http://localhost:7337
traces DB      ->  /home/you/.minion/traces.db
```

| Option | Default | Description |
| --- | --- | --- |
| `--port PORT` | `7337` | Port to listen on |
| `--db-path PATH` | `~/.minion/traces.db` | SQLite file to read and write |

The server binds `0.0.0.0`, so it is reachable from other machines on the
network. It has **no authentication on the dashboard or read endpoints** — only
trace ingest requires a token. Don't expose it beyond a trusted network without
putting your own auth in front of it.

```bash
minion serve --port 8080 --db-path ./project-traces.db
```

`--db-path` sets `MINION_DB_PATH` for the process. It is ignored if
`DATABASE_URL` is set in the environment, which takes priority and is how you
point the server at Postgres:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/minion minion serve
```

Migrations run automatically at startup on both SQLite and Postgres. Upgrading
the package and restarting applies new schema changes in place, without losing
data.

### The bundled dashboard

`minion serve` ships a pre-built React bundle, so it needs no Node toolchain.
Working on the UI itself is a two-terminal setup — see
[Developing the dashboard](/guides/dashboard/#developing-the-dashboard).

## Running the server without the CLI

`minion serve` is a thin wrapper over a FastAPI app you can run directly — which
is what the container image does, and what you want behind a process manager:

```bash
uvicorn minions.server.app:app --host 0.0.0.0 --port 7337
```

`minion-ai` bundles FastAPI, uvicorn and the Postgres driver, so nothing extra is
needed. See [Self-hosting](/deployment/self-hosting/).

:::note
`python -m minions.cli` does nothing — the module has no `__main__` guard. Use
the `minion` executable.
:::
