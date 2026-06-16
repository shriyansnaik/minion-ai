# Publishing to PyPI *(maintainers)*

The library is published to PyPI by GitHub Actions using **Trusted Publishing**
(OIDC) — there is no API token to create, store, or rotate. The workflow lives at
`.github/workflows/pypi-publish.yml`.

## One-time setup on PyPI

`minion-ai` already exists on PyPI, so add the trusted publisher to the existing
project:

1. Sign in at https://pypi.org and open **Your projects → minion-ai → Settings**.
2. Scroll to **Publishing** → **Add a new publisher** → **GitHub**.
3. Fill in:
   - **Owner:** `shriyansnaik`
   - **Repository name:** `minion-ai`
   - **Workflow name:** `pypi-publish.yml`
   - **Environment:** *(leave blank)*
4. Save.

That's it — no secrets in GitHub.

## Releasing a version

1. Bump `version` in `pyproject.toml` (PyPI rejects re-uploading an existing version).
2. Commit and push.
3. Tag and push the tag:
   ```bash
   git tag v0.1.2
   git push origin v0.1.2
   ```

The tag triggers **both** release workflows:

- `pypi-publish.yml` → builds the UI, builds the package, publishes to PyPI.
- `docker-publish.yml` → builds and pushes the multi-arch Docker image.

So one tag ships both `pip install minion-ai` and `docker pull shriyansnaik/minion-ui`.

You can also run either workflow manually from the **Actions** tab without tagging.

## Why the workflow builds the UI

The compiled dashboard (`minions/server/ui/dist/`) is gitignored, so a fresh
checkout doesn't contain it. The workflow runs `npm ci && npm run build` before
`python -m build` so the published wheel and sdist include the dashboard. (Building
locally works the same way — build the UI first, then `python -m build`.)
