// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Canonical URL for sitemap/OG tags. Set SITE_URL in the Vercel project once the
// real domain is attached; the default keeps local builds and previews working.
const site = process.env.SITE_URL ?? "https://minion-ai.vercel.app";

const REPO = "https://github.com/shriyansnaik/minion-ai";

export default defineConfig({
  site,
  integrations: [
    starlight({
      title: "Minion",
      description:
        "A lightweight agentic framework with observability baked in. Build agents that think, use tools, and delegate — and see every turn, token, and dollar.",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        { icon: "github", label: "GitHub", href: REPO },
        {
          icon: "seti:python",
          label: "PyPI",
          href: "https://pypi.org/project/minion-ai",
        },
      ],
      editLink: {
        baseUrl: `${REPO}/edit/main/website/`,
      },
      lastUpdated: true,
      sidebar: [
        {
          label: "Getting started",
          items: [
            { slug: "getting-started/what-is-minion" },
            { slug: "getting-started/installation" },
            { slug: "getting-started/first-agent" },
            { slug: "getting-started/first-trace" },
          ],
        },
        {
          label: "Guides",
          items: [
            { slug: "guides/tools" },
            { slug: "guides/sub-agents" },
            { slug: "guides/parallel-tools" },
            { slug: "guides/tracing" },
            { slug: "guides/cost-tracking" },
            { slug: "guides/dashboard" },
          ],
        },
        {
          label: "Cookbook",
          items: [
            { slug: "cookbook" },
            { slug: "cookbook/changelog-writer" },
            { slug: "cookbook/codebase-explainer" },
            { slug: "cookbook/support-triage" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { slug: "deployment/choosing-a-database" },
            { slug: "deployment/self-hosting" },
            { slug: "deployment/remote-tracing" },
            { slug: "deployment/team-quickstart" },
          ],
        },
        {
          label: "Reference",
          items: [
            { slug: "reference/minion" },
            { slug: "reference/init" },
            { slug: "reference/cli" },
            { slug: "reference/providers" },
          ],
        },
        {
          label: "Contributing",
          items: [
            { slug: "contributing" },
            { slug: "contributing/releasing" },
            { slug: "contributing/publishing" },
          ],
        },
        { label: "Changelog", link: "/changelog/" },
      ],
    }),
  ],
});
