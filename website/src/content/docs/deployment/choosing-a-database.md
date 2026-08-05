---
title: Choosing a database
description: SQLite or Postgres, local file or shared server — when to use which, and why.
sidebar:
  order: 1
---

Minion has two independent choices, and they're often confused:

1. **Where your agent writes traces** — a local file, or over HTTP to a server.
2. **What that server stores them in** — SQLite or Postgres.

Choice 1 is set in [`init()`](/reference/init/); choice 2 is set on the server
with `DATABASE_URL`. Your agent code never knows or cares which database is
behind the server.

## The decision

| You are | Use |
| --- | --- |
| One developer, one laptop | **Local SQLite.** `init(tracing=True, project="…")`, then `minion serve`. Nothing to deploy. |
| A team, or agents on several machines | **A shared server.** Agents push over HTTP with `trace_url`. |
| A shared server, small volume | **Server on SQLite** (the default). One container, one volume. |
| A shared server, real volume or concurrent writers | **Server on Postgres.** |

Most projects start at the top row and never move. Don't deploy a server until
more than one machine needs to write traces.

## Local SQLite

```python
minions.init(tracing=True, project="my-project")
```

Writes to `~/.minion/traces.db`. Read it with `minion serve`. No container, no
network, no credentials, and nothing leaves the machine.

Override the path when you want traces beside a project rather than in your home
directory:

```python
minions.init(tracing=True, project="my-project", db_path="./traces.db")
```

```bash
minion serve --db-path ./traces.db
```

:::caution
A SQLite file is not a sharing mechanism. Putting `traces.db` on a network share
or in Dropbox so two people can write to it will corrupt it. Two writers means
you want a server.
:::

## Server on SQLite

The default for the container. One service, one volume — traces live at
`/root/.minion` inside the container.

Good for a small team writing traces at a human pace. SQLite takes a database-
level write lock, so concurrent pushes serialise. In practice that's invisible
until you have many agents writing at once.

## Server on Postgres

Set `DATABASE_URL` and the same image switches:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/minion
```

Reach for it when:

- **Several agents write concurrently.** Postgres handles concurrent writers;
  SQLite serialises them.
- **You want managed backups and point-in-time restore.** RDS, Supabase and Neon
  give you this; a Docker volume doesn't.
- **You filter on metadata a lot.** On Postgres, `metadata` is stored as `JSONB`
  with a GIN index and a multi-key filter is one indexed containment check. On
  SQLite it's a `json_extract` comparison per key, with no index behind it.
- **Trace volume is large.** Both dialects have indexes on `runs` and use keyset
  pagination, but Postgres has the better story as the table grows.

A bare `postgresql://` URL is routed through psycopg 3 automatically — paste the
connection string your provider gives you as-is.

## Switching later

There is **no migration path between SQLite and Postgres.** Point the server at
a new `DATABASE_URL` and it starts with an empty database; the old traces stay
in the old one.

That's usually fine — traces are operational data, most valuable while recent.
If it isn't fine for you, plan to start on Postgres. What you don't have to plan
for is the schema: Alembic migrations run automatically at startup on both
dialects, and they're additive, so upgrading the image or the package never
loses data.

## Retention

There is no automatic retention or TTL. Traces accumulate until you delete them,
which you can do from the dashboard by filter, by selection, or by project — see
[The dashboard](/guides/dashboard/#deleting). Deletes cascade to a run's turns,
tool calls and immediate sub-runs.

For a long-lived Postgres deployment, a scheduled `DELETE FROM runs WHERE
created_at < …` is the pragmatic answer today.

## Next

- **[Self-hosting the server](/deployment/self-hosting/)** — running the container
- **[Remote tracing](/deployment/remote-tracing/)** — pointing agents at it
