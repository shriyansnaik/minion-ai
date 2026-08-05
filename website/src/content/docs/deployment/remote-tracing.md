---
title: Remote tracing
description: Point agents at a shared trace server, create project-scoped tokens, and understand the failure modes.
sidebar:
  order: 3
---

By default an agent writes traces to a local SQLite file. Add `trace_url` and a
token and it pushes them over HTTP to a [server you
run](/deployment/self-hosting/) instead. Nothing is written locally in this mode.

```python
import minions

minions.init(
    tracing=True,
    project="my-project",
    trace_url="https://traces.mycompany.com",
    tracing_secret_token="mni_xK9mP2...",
)
```

Installing `minion-ai` is all an agent machine needs — there's no separate
client package.

## Getting a token

1. Open the dashboard and create (or open) the project.
2. Go to **the project → ⚙️ Settings → API Tokens → Create token**.
3. **Copy it immediately.** It's shown once; only its hash is stored.

A token is scoped to exactly one project, and the `project` you pass to `init()`
must match the project the token belongs to.

## The startup check

`init()` verifies the token against `trace_url` before returning, and raises on
a mismatch:

| Situation | Result |
| --- | --- |
| Token valid, project matches | `init()` returns; pushes will work |
| Token invalid or revoked | `ValueError` — "token is invalid or revoked" |
| Token valid, different project | `ValueError` — "not scoped to that project" |
| Server unreachable | Warning logged, `init()` **continues**, agent runs |

This check exists because the failure it catches is otherwise silent. A
mismatched token means the server rejects every push with a 403; each rejection
is only logged as a warning (so the agent keeps running); and no trace ever
appears with nothing to explain why. Better to fail at line one.

The mismatch error deliberately doesn't say which project the token *does*
belong to — a leaked token shouldn't double as a way to enumerate project names.

## Reliability

After startup, tracing never crashes your agent. If the server is down, slow, or
erroring, the push is skipped, a warning is logged, and the run continues and
returns its answer.

Two consequences worth knowing:

- **Pushes are best-effort and not queued.** A trace lost to an outage is lost;
  there is no local buffer that replays later.
- **Pushes are synchronous with the run.** A slow server adds latency to your
  agent. Keep the trace server close to the agents, network-wise.

## Managing tokens

- **One token per deployment**, not one per team — a CI token, a staging token,
  a laptop token. Revocation is then surgical.
- **Revoke** from the same settings panel. It takes effect immediately;
  subsequent pushes get a 403 and are skipped as warnings.
- **Rotate** by creating the new token, deploying it, then revoking the old one.
  Both work during the overlap.
- Tokens are secrets. Put them in your environment or secret manager, not in the
  source:

```python
import os

minions.init(
    tracing=True,
    project="my-project",
    trace_url=os.environ["MINION_TRACE_URL"],
    tracing_secret_token=os.environ["MINION_TRACE_TOKEN"],
)
```

## Sending to different environments

Configuration is per-process, so environment separation is just different values
— and usually different projects, since projects are the hard boundary in the
dashboard:

```python
env = os.environ.get("APP_ENV", "dev")

minions.init(
    tracing=True,
    project=f"checkout-{env}",
    trace_url=os.environ["MINION_TRACE_URL"],
    tracing_secret_token=os.environ["MINION_TRACE_TOKEN"],
)
```

Each project needs its own token.

## Local development against a remote server

Point at it exactly like production, with a token of your own:

```python
minions.init(
    tracing=True,
    project="my-project-dev",
    trace_url="http://localhost:7337",
    tracing_secret_token="mni_...",
)
```

Or skip the server entirely while developing — drop `trace_url` and
`tracing_secret_token` and you're back to a local file with `minion serve`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `ValueError` at startup: "not scoped to that project" | The `project` in `init()` doesn't match the token's project |
| `ValueError` at startup: "token is invalid or revoked" | Wrong, revoked, or mistyped token |
| Other `ValueError` at startup | `trace_url`/token set without the other, or without `tracing=True` and a `project` |
| Connection warning at startup, agent runs | Server unreachable at `init()` — expected, non-fatal |
| `403` warnings during a run | Token revoked *after* startup |
| Runs appear but show no cost | The model isn't in the price table — add a [custom price](/guides/cost-tracking/#custom-prices) |
| No traces at all, no errors | Check `tracing=True` is actually set, and that `init()` runs before any `Minion` is constructed |
