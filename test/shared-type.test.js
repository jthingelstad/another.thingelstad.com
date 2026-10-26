import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";

// The type Jamie's sites share (thingelstad.com/AGENTS.md, "Shared type and
// colour"): src/assets/css/shared/ is a byte-for-byte copy of
// thingelstad.com shared/tokens.css and shared/fonts/, vendored by
// npm run sites:sync. These tests pin the copy, how the pages load it, and
// the blog's scale in main.css (nothing below 14px).

const root = fileURLToPath(new URL("..", import.meta.url));
const vendoredDir = new URL("../src/assets/css/shared/", import.meta.url);
const css = await readFile(new URL("../src/assets/css/main.css", import.meta.url), "utf8");

test("vendored tokens.css and fonts match the shared copy", async (t) => {
  const sitesSource = new URL(process.env.SITES_SOURCE || "../shared/sites.json", pathToFileURL(root));
  const sharedDir = new URL(".", sitesSource);
  const fonts = await readdir(new URL("fonts/", sharedDir)).catch(() => null);
  if (fonts === null) {
    t.skip(`${fileURLToPath(sharedDir)} is not checked out here (CI checks out only this repo); npm run sites:check covers it locally`);
    return;
  }
  const files = ["tokens.css", ...fonts.filter((name) => /\.(woff2|txt)$/.test(name)).map((name) => `fonts/${name}`)];
  for (const file of files) {
    const [want, have] = await Promise.all([readFile(new URL(file, sharedDir)), readFile(new URL(file, vendoredDir)).catch(() => null)]);
    assert.ok(have && want.equals(have), `Vendored ${file} is stale. Run npm run sites:sync.`);
  }
});

test("every page loads the shared type from this site, and no font host", async () => {
  const eleventy = new Eleventy(`${root}src`, `${root}_site`, { configPath: `${root}eleventy.config.js`, quietMode: true });
  // Redirect stubs for old micro.blog URLs (src/legacy-redirects.njk) are not pages.
  const pages = (await eleventy.toJSON()).filter((page) => page.outputPath?.endsWith(".html") && !page.content.includes('http-equiv="refresh"'));
  assert.ok(pages.length > 0);

  for (const page of pages) {
    const head = page.content.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";
    assert.ok(head.includes('<link rel="stylesheet" href="/assets/css/shared/tokens.css">'), `${page.url}: tokens.css`);
    assert.ok(
      head.indexOf("/assets/css/shared/tokens.css") < head.indexOf("/assets/css/main.css"),
      `${page.url}: tokens.css loads before main.css`,
    );
    assert.doesNotMatch(page.content, /rsms\.me|fonts\.googleapis|fonts\.gstatic|use\.typekit/, `${page.url}: external font host`);

    const preloads = [...head.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map(([, href]) => href);
    assert.deepEqual(preloads, [
      "/assets/css/shared/fonts/inter-latin-wght-normal.woff2",
      "/assets/css/shared/fonts/inter-tight-latin-wght-normal.woff2",
    ], `${page.url}: font preloads`);
    for (const href of preloads) await access(new URL(`../src${href}`, import.meta.url));
  }
});

test("main.css names faces by role and takes them from the shared tokens", () => {
  const roles = {
    "--font-heading": "var(--jt-font-heading)",
    "--font-body": "var(--jt-font-body)",
    "--font-ui": "var(--jt-font-body)",
    "--font-label": "var(--jt-font-body)",
    "--font-code": "var(--jt-font-mono)",
    "--weight-heading": "var(--jt-weight-heading)",
  };
  for (const [name, value] of Object.entries(roles)) {
    assert.match(css, new RegExp(`${name}:\\s*${value.replace(/[()]/g, "\\$&")};`), name);
  }
  assert.match(css, /--container:\s*var\(--jt-frame\);/, "the frame is every site's 1120px");
  assert.match(css, /body \{[^}]*font-size:\s*var\(--jt-size-base\);/, "body is the blog's 19px");

  // The strip names Inter itself: its values are the shared contract.
  const outsideStrip = css.replace(/\.sites-strip \{[\s\S]*?\n\}/, "");
  for (const [, value] of outsideStrip.matchAll(/font-family:\s*([^;]+);/g)) {
    assert.match(value, /^(var\(--font-[a-z]+\)|inherit)$/, `font-family: ${value} names a face; use a role`);
  }
  for (const [, value] of outsideStrip.matchAll(/--pagefind-ui-font:\s*([^;]+);/g)) {
    assert.match(value, /^var\(--font-[a-z]+\)$/);
  }
});

test("nothing in main.css is set below 14px", () => {
  const px = (value) => {
    const match = value.match(/^([\d.]+)(px|rem)$/);
    return match ? Number(match[1]) * (match[2] === "rem" ? 16 : 1) : null;
  };
  const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map(([, value]) => value.trim());
  assert.ok(sizes.length > 20);
  for (const size of sizes) {
    if (size.startsWith("var(--jt-size-")) continue;
    const parts = size.startsWith("clamp(") ? [size.slice(6, -1).split(",")[0].trim()] : [size];
    for (const part of parts) {
      const value = px(part);
      assert.ok(value !== null, `font-size: ${size} is not px, rem or a --jt-size token`);
      assert.ok(value >= 14, `font-size: ${size} is below 14px`);
    }
  }
  // Pagefind's UI sizes are calc(14|16|21px * scale).
  const scale = Number(css.match(/--pagefind-ui-scale:\s*([\d.]+)/)?.[1]);
  assert.ok(scale >= 1, `--pagefind-ui-scale ${scale} puts Pagefind's smallest text below 14px`);
});

// No slanted sans in the design. Jamie, 2026-10-22: "I really dislike italics
// with san serif fonts … I like the color and I like using font weight with
// san serif". Titles and pull quotes stand upright; the <i> tags in the
// templates are the decorative dots, not text.
test("nothing in main.css slants the type", () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(rules, /font-style:\s*(italic|oblique)/);
  assert.doesNotMatch(rules, /font-variation-settings:[^;]*"slnt"/);
  assert.doesNotMatch(rules, /transform:[^;]*skew/);
});
