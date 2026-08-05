---
title: Releasing
description: Maintainer runbook — one tag publishes the package to PyPI and the image to Docker Hub.
---

:::note
Maintainers only. A release publishes both halves of the project from a
**single version tag**, entirely on GitHub Actions — nothing is built locally.

- `minion-ai` → **PyPI** (`pip install minion-ai`)
- `minion-server` multi-arch image → **Docker Hub**
  (`docker pull shriyansnaik/minion-server`)
:::

## When to release

`main` is for ongoing work; cut a release when there's something worth shipping.
Pick the version with [semver](https://semver.org):

| Bump | Example | When |
| --- | --- | --- |
| **Patch** | 0.1.2 → 0.1.3 | Bug fixes, doc fixes — no API change |
| **Minor** | 0.1.3 → 0.2.0 | New features, backward compatible |
| **Major** | 0.2.0 → 1.0.0 | Breaking changes |

Pre-1.0, breaking changes ship in minor bumps and are called out inline in the
changelog rather than saved for a major.

## Steps

1. **Make sure `main` has everything you want to ship**, and that the
   `[Unreleased]` section of `CHANGELOG.md` describes it.

2. **Move `[Unreleased]` to the new version** with today's date:

   ```markdown
   ## [0.1.4] - 2026-08-05
   ```

   This is what the public [changelog page](/changelog/) renders — it's
   generated from this file at build time, so there's nothing else to update.

3. **Bump `version` in `pyproject.toml`.** It must be new; PyPI permanently
   rejects re-uploading a version.

   ```toml
   version = "0.1.4"
   ```

4. **Commit and push:**

   ```bash
   git add pyproject.toml CHANGELOG.md
   git commit -m "Release v0.1.4"
   git push
   ```

5. **Tag with the same version**, `v`-prefixed, and push the tag:

   ```bash
   git tag v0.1.4
   git push origin v0.1.4
   ```

6. **Watch the Actions tab.** Two independent workflows run on the tag:
   - *Publish to PyPI* — builds the UI, builds the package, publishes via OIDC
     trusted publishing
   - *Publish minion-server image* — builds `amd64` and `arm64` on native
     runners, pushes one multi-arch tag

7. **Verify** once both are green:

   ```bash
   pip install minion-ai==0.1.4
   docker buildx imagetools inspect shriyansnaik/minion-server:0.1.4
   ```

   The inspect output should list both `linux/amd64` and `linux/arm64`.

## If something goes wrong

**A published PyPI version can never be replaced.** If a release is broken, yank
it on PyPI and ship the next patch. Never try to re-tag the same version.

**One workflow failed, the other succeeded?** They're independent. Fix the cause
and **re-run that workflow** from the Actions tab — no re-tag needed. The Docker
job is always safe to re-run. For PyPI, only re-run if it didn't actually
upload; otherwise bump the version.

Both workflows have a manual **Run workflow** button for testing, but a real
release should always come from a tag so the version is recorded in git.

## One-time setup

Already configured for this repo; here for the record.

- **PyPI trusted publishing** — the project is registered as a trusted publisher
  for this repo and workflow, so no API token is stored.
- **Docker Hub** — `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository
  secrets.

:::caution[Pending manual step]
The Docker Hub repo `shriyansnaik/minion-server` is created on first push after
the `minion-ui` → `minion-server` rename. After that first release: set the
description and README on the new repo, and mark the old `minion-ui` repo
deprecated. Docker Hub can't rename a repo in place, so the old tags are
orphaned rather than moved.
:::
