# Minion AI — Documentation

Minion AI has two pieces:

- **minion-ai** — the agent library your code runs (`pip install minion-ai`).
- **minion-ui** — a dashboard server that stores and displays traces.

You can run them together on one machine, or run the dashboard as a shared
server that many agents push to.

## Deployment topologies

| Mode | Where traces go | Setup |
|---|---|---|
| **Local** | Local SQLite file on the same machine | [remote-tracing.md › Local](remote-tracing.md#local-mode) |
| **Distributed** | An agent on machine A pushes to a dashboard on machine B | [hosting.md](hosting.md) + [remote-tracing.md › Remote](remote-tracing.md#remote-mode) |

The dashboard server can store traces in:

- **SQLite** (default — a single file, zero setup)
- **PostgreSQL** (a container you run, or a managed URL like RDS / Supabase / Neon)

## Guides

- **[quickstart-mac.md](quickstart-mac.md)** — start-to-finish on a Mac (Apple Silicon): Postgres dashboard in Docker + a traced agent. Easiest way to see the whole thing working.
- **[multi-agent.md](multi-agent.md)** — build a team of minions: a manager that delegates to named specialists (researcher + writer) and to ad-hoc workers, with the whole tree traced.
- **[hosting.md](hosting.md)** — run the dashboard server (Docker or bare uvicorn; SQLite or Postgres).
- **[remote-tracing.md](remote-tracing.md)** — point your agent at a local file or a remote server, and create API tokens.
- **[releasing.md](releasing.md)** — *(maintainers)* cut a release: one tag publishes to PyPI **and** Docker Hub, plus when to bump which version.
- **[publishing-the-image.md](publishing-the-image.md)** — *(maintainers)* details of the `minion-ui` image build/registry.
- **[publishing-to-pypi.md](publishing-to-pypi.md)** — *(maintainers)* details of the PyPI trusted-publishing setup.
