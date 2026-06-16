# Cutting a release *(maintainers)*

A release publishes both halves of the project from a **single version tag** — no
local builds, everything runs on GitHub Actions:

- `minion-ai` → **PyPI** (`pip install minion-ai`)
- `minion-ui` multi-arch image → **Docker Hub** (`docker pull shriyansnaik/minion-ui`)

## When to release

There's no need to release on every commit — `main` is for ongoing work; you cut a
release when there's something worth shipping to users. Pick the new version with
[semver](https://semver.org):

| Bump | Example | When |
|---|---|---|
| **Patch** | 0.1.2 → 0.1.3 | Bug fixes, doc fixes — no API change |
| **Minor** | 0.1.3 → 0.2.0 | New features, backward compatible |
| **Major** | 0.2.0 → 1.0.0 | Breaking changes |

## Prerequisites (one-time, already configured)

- **PyPI trusted publisher** — see [publishing-to-pypi.md](publishing-to-pypi.md)
- **Docker Hub secrets** (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) — see
  [publishing-the-image.md](publishing-the-image.md)

## Steps

1. Make sure `main` has everything you want to ship.

2. Bump `version` in `pyproject.toml` (it **must** be new — PyPI permanently
   rejects re-uploading a version):
   ```toml
   version = "0.1.3"
   ```

3. Commit and push:
   ```bash
   git add pyproject.toml
   git commit -m "Release v0.1.3"
   git push
   ```

4. Tag with the **same** version (prefixed with `v`) and push the tag:
   ```bash
   git tag v0.1.3
   git push origin v0.1.3
   ```

5. Watch the **Actions** tab. Two workflows run on the tag:
   - **Publish to PyPI** — builds the UI, builds the package, publishes via OIDC
   - **Publish minion-ui image** — builds `amd64` + `arm64` on native runners, pushes a multi-arch tag

6. Verify once both are green:
   ```bash
   pip install minion-ai==0.1.3
   docker buildx imagetools inspect shriyansnaik/minion-ui:0.1.3   # lists linux/amd64 and linux/arm64
   ```

## If something goes wrong

- **A published PyPI version can never be replaced.** If a release is broken, yank
  the bad version on PyPI and ship the next patch (e.g. `0.1.4`). Don't try to
  re-tag the same version.
- **One workflow failed, the other succeeded?** They're independent. Fix the cause
  (e.g. a missing Docker Hub secret) and **re-run that workflow** from the Actions
  tab — no need to re-tag. The Docker job is safe to re-run; for PyPI, only re-run
  if it didn't actually upload (otherwise bump the version).
- Both workflows also have a **Run workflow** button (manual trigger) for testing,
  but a real release should always be tagged so the version is recorded in git.
