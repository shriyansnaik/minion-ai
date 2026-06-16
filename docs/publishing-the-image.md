# Publishing the minion-ui image *(maintainers)*

The dashboard ships as a Docker image. Publishing it to a registry is the Docker
equivalent of publishing the library to PyPI: once it's on a registry, anyone can
host the dashboard with just a compose file (`image: …`) — no need to clone the
repo and build.

**Is it required?** No. The repo-root `docker-compose*.yml` files use `build: .`,
so users with the source can build locally. Publishing is only needed if you want
people to host it *without* the source.

Two common registries:

- **GitHub Container Registry (GHCR)** — free, tied to the GitHub repo. Recommended.
- **Docker Hub** — most familiar; free public repos.

---

## Recommended: build via GitHub Actions (no local build)

The repo ships a workflow at **`.github/workflows/docker-publish.yml`** that builds
the image on GitHub's servers — each architecture on its own **native runner** (so
no slow QEMU emulation) — and pushes a single multi-arch tag to Docker Hub. This
keeps the heavy build off your laptop.

**One-time setup** — in the GitHub repo, go to
**Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | your Docker Hub username (e.g. `shriyansnaik`) |
| `DOCKERHUB_TOKEN` | a Docker Hub access token (Hub → Account → Security → New Access Token) |

**Run it:**

- **Manually:** repo → **Actions** tab → *Publish minion-ui image* → **Run workflow**. Publishes `:latest`.
- **On release:** push a version tag and it publishes the matching versions:
  ```bash
  git tag v0.1.2
  git push origin v0.1.2     # -> :0.1.2, :0.1, :latest
  ```

When it finishes, the workflow's final step prints the manifest showing both
`linux/amd64` and `linux/arm64`. Done — no local Docker needed.

The manual commands below are the fallback if you'd rather build locally.

The image is built by the repo-root `Dockerfile` (a multi-stage build: it compiles
the React UI with Node, then installs the Python server). The build is fully
self-contained — no local `dist/` or extra steps needed.

---

## GitHub Container Registry (GHCR)

```bash
# 1. Authenticate (use a Personal Access Token with write:packages scope)
echo "$GHCR_PAT" | docker login ghcr.io -u shriyansnaik --password-stdin

# 2. Build and tag (match the version to pyproject.toml)
docker build -t ghcr.io/shriyansnaik/minion-ui:0.1.2 \
             -t ghcr.io/shriyansnaik/minion-ui:latest .

# 3. Push
docker push ghcr.io/shriyansnaik/minion-ui:0.1.2
docker push ghcr.io/shriyansnaik/minion-ui:latest
```

After the first push, make the package public in the repo's **Packages** settings
so users can pull without authenticating.

---

## Docker Hub

```bash
docker login -u shriyansnaik

docker build -t shriyansnaik/minion-ui:0.1.2 \
             -t shriyansnaik/minion-ui:latest .

docker push shriyansnaik/minion-ui:0.1.2
docker push shriyansnaik/minion-ui:latest
```

---

## Multi-architecture (optional, recommended)

To support both Intel/AMD and Apple Silicon / ARM servers:

```bash
docker buildx create --use --name minion-builder   # once
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/shriyansnaik/minion-ui:0.1.2 \
  -t ghcr.io/shriyansnaik/minion-ui:latest \
  --push .
```

---

## Versioning

- Tag the image with the same version as `pyproject.toml` (e.g. `0.1.2`) **and**
  `latest`.
- Bump `latest` only for releases you want hosts to pick up on their next pull.

---

## Telling users which image to use

Once published, point the hosting docs / compose files at it:

```yaml
services:
  minion-ui:
    image: ghcr.io/shriyansnaik/minion-ui:latest   # instead of `build: .`
    # ...
```

See [hosting.md](hosting.md) for the full compose examples.
