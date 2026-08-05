/**
 * Generates the public changelog page from the repo's CHANGELOG.md.
 *
 * The generated file is gitignored and rebuilt on every `dev` and `build`, so
 * the changelog is never hand-maintained in two places — CHANGELOG.md is the
 * only source of truth.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(here, "../src/content/docs/changelog.md");

/**
 * Walk up from the script looking for the repo's CHANGELOG.md, rather than
 * assuming a fixed depth. Works from the website dir, the repo root, or
 * wherever a CI runner decides to put things.
 */
function findChangelog() {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, "CHANGELOG.md");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Fetch CHANGELOG.md from the repo at the exact commit being built.
 *
 * Vercel's Root Directory is `website`, so unless "Include source files outside
 * of the Root Directory in the Build Step" is ticked, nothing above it is
 * uploaded and the repo-root CHANGELOG.md is simply not on disk. Rather than
 * depend on that setting -- or keep a second copy of the changelog in here,
 * which is exactly the drift the generated page exists to prevent -- read it
 * over HTTP, pinned to this deployment's commit. Pinning is what preserves the
 * guarantee: the page cannot show a changelog other than the one that shipped.
 *
 * Needs the repo to be publicly readable. Returns null if it can't fetch.
 */
async function fetchChangelog() {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!owner || !slug || !sha) return null;

  const url = `https://raw.githubusercontent.com/${owner}/${slug}/${sha}/CHANGELOG.md`;
  console.log(`changelog: not on disk, fetching ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`changelog: fetch returned ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.text();
  } catch (e) {
    console.error(`changelog: fetch failed - ${e.message}`);
    return null;
  }
}

const SOURCE = findChangelog();
if (SOURCE) console.log(`changelog: reading ${SOURCE}`);
const raw = SOURCE ? readFileSync(SOURCE, "utf8") : await fetchChangelog();

if (raw === null) {
  console.error(
    "\nchangelog: could not read CHANGELOG.md, from disk or over HTTP.\n" +
    "\n" +
    "It lives at the repo root and is the single source for the changelog page.\n" +
    "Locally: run this from inside the repo.\n" +
    "On Vercel: tick Settings -> Build and Deployment -> Root Directory ->\n" +
    "  'Include source files outside of the Root Directory in the Build Step',\n" +
    "  which puts the file on disk and skips the fetch entirely.\n"
  );
  process.exit(1);
}

// Drop the "# Changelog" heading and the Keep a Changelog blurb under it —
// Starlight renders the page title itself, and the blurb is restated below in
// wording that suits a docs page.
const body = raw
  .replace(/^#\s+Changelog\s*\n/, "")
  .replace(
    /^All notable changes[^\n]*\n^Format follows[^\n]*\n/m,
    "",
  )
  .trim();

const page = `---
title: Changelog
description: Every released version of Minion, and what changed in it.
editUrl: false
---

<!-- AUTO-GENERATED from CHANGELOG.md by scripts/generate-changelog.mjs.
     Edit CHANGELOG.md at the repo root instead — changes here are overwritten. -->

Every notable change to Minion, newest first. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versions follow
[semantic versioning](https://semver.org/) — and while Minion is pre-1.0,
breaking changes are called out inline rather than saved for a major bump.

${body}
`;

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, page);

const versions = (body.match(/^##\s+\[/gm) ?? []).length;
console.log(`changelog: wrote ${versions} sections to src/content/docs/changelog.md`);
