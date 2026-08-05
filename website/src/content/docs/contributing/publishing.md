---
title: Publishing setup
description: Maintainer reference — how the PyPI and Docker Hub pipelines are wired, and how to build either by hand.
---

:::note
Maintainers only, and mostly one-time setup that is **already done**. The
day-to-day process is [Releasing](/contributing/releasing/) — tag, and both
artifacts publish themselves.
:::

## PyPI — trusted publishing

The library publishes via GitHub Actions using **Trusted Publishing** (OIDC).
There is no API token to create, store, or rotate. The workflow is
`.github/workflows/pypi-publish.yml`.

One-time setup on PyPI, for the record:

1. **Your projects → minion-ai → Settings**.
2. **Publishing → Add a new publisher → GitHub**.
3. Owner `shriyansnaik`, repository `minion-ai`, workflow `pypi-publish.yml`,
   environment blank.

### Why the workflow builds the UI first

The compiled dashboard at `minions/server/ui/dist/` is gitignored, so a fresh
checkout doesn't have it. The workflow runs `npm ci && npm run build` before
`python -m build`, so the published wheel and sdist include the dashboard.
`pyproject.toml` lists it under `[tool.hatch.build] artifacts` for exactly this
reason.

Building by hand follows the same order:

```bash
cd ui && npm ci && npm run build && cd ..
python -m build
```

Skip the UI build and you'll ship a package whose `minion serve` returns a blank
page.

## Docker Hub — the image

The workflow is `.github/workflows/docker-publish.yml`. It builds each
architecture on its own **native runner** — no QEMU emulation — and pushes one
multi-arch tag.

One-time setup, under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token (Hub → Account → Security) |

Triggers:

- **Manually** — Actions → *Publish minion-server image* → Run workflow.
  Publishes `:latest`.
- **On a version tag** — `git push origin v0.1.4` publishes `:0.1.4`, `:0.1` and
  `:latest`.

The final step prints the manifest, which should list both `linux/amd64` and
`linux/arm64`.

### Building the image by hand

The fallback, if CI is unavailable. The root `Dockerfile` is a multi-stage build
— it compiles the React UI with Node, then installs the Python server — so it is
self-contained and needs no local `dist/`.

```bash
docker login -u shriyansnaik

docker build -t shriyansnaik/minion-server:0.1.4 \
             -t shriyansnaik/minion-server:latest .

docker push shriyansnaik/minion-server:0.1.4
docker push shriyansnaik/minion-server:latest
```

Multi-arch by hand:

```bash
docker buildx create --use --name minion-builder    # once
docker buildx build --platform linux/amd64,linux/arm64 \
  -t shriyansnaik/minion-server:0.1.4 \
  -t shriyansnaik/minion-server:latest \
  --push .
```

### GHCR as an alternative

The image also builds and pushes to GitHub Container Registry unchanged — swap
the registry prefix:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u shriyansnaik --password-stdin
docker build -t ghcr.io/shriyansnaik/minion-server:0.1.4 .
docker push ghcr.io/shriyansnaik/minion-server:0.1.4
```

After the first push, make the package public in the repo's **Packages**
settings so users can pull without authenticating.

## Versioning

- The image tag matches `version` in `pyproject.toml`.
- `:latest` moves only for releases you want existing hosts to pick up on their
  next `docker compose pull`.
- Publishing the image is not strictly required for development — the repo-root
  `docker-compose*.yml` files use `build: .`, so anyone with the source can build
  locally. Publishing is what lets people host the dashboard *without* the
  source.
