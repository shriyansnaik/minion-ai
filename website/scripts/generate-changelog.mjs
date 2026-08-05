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

const SOURCE = findChangelog();

if (!SOURCE) {
  // Almost always this one thing, so say it rather than making the reader guess.
  console.error(
    "\nchangelog: could not find CHANGELOG.md above " + here + "\n" +
    "\n" +
    "On Vercel this means the build can only see the `website/` directory.\n" +
    "CHANGELOG.md lives at the repo root, one level up, and is the single\n" +
    "source for the changelog page.\n" +
    "\n" +
    "Fix: Vercel project -> Settings -> Build and Deployment -> Root Directory\n" +
    "     -> tick 'Include files outside of the Root Directory in the Build Step'\n" +
    "\n" +
    "Locally, run this from inside the repo.\n"
  );
  process.exit(1);
}

const raw = readFileSync(SOURCE, "utf8");

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
