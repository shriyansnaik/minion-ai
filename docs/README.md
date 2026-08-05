# Documentation

**The docs live on the website: <https://minions-ai.vercel.app>**

They used to live here as loose markdown files. They are now a single Starlight
site with navigation, search, and a changelog page generated from
`CHANGELOG.md`. Keeping a second copy in this folder would only guarantee one of
them was wrong, so this folder is now a pointer.

## Where everything went

| Was | Now |
| --- | --- |
| `providers.md` | [Provider support](https://minions-ai.vercel.app/reference/providers/) |
| `hosting.md` | [Self-hosting the server](https://minions-ai.vercel.app/deployment/self-hosting/) |
| `remote-tracing.md` | [Remote tracing](https://minions-ai.vercel.app/deployment/remote-tracing/) |
| `quickstart-mac.md` | [Team quickstart](https://minions-ai.vercel.app/deployment/team-quickstart/) |
| `multi-agent.md` | [Sub-agents & specialists](https://minions-ai.vercel.app/guides/sub-agents/) |
| `releasing.md` | [Releasing](https://minions-ai.vercel.app/contributing/releasing/) |
| `publishing-to-pypi.md`, `publishing-the-image.md` | [Publishing setup](https://minions-ai.vercel.app/contributing/publishing/) |

## Editing the docs

The source is markdown in [`website/src/content/docs/`](../website/src/content/docs/) —
read it on GitHub if you prefer, or use the **Edit page** link on any page of
the site.

```bash
cd website
npm install
npm run dev        # http://localhost:4321
```

The changelog page is generated from the repo-root `CHANGELOG.md` on every
`dev` and `build`. Edit that file, never `website/src/content/docs/changelog.md`.

See [Contributing](https://minions-ai.vercel.app/contributing/) for the repo
layout and the dev loop.
