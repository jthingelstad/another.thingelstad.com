import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";

// The "Jamie's sites" strip is a shared contract across Jamie's sites
// (thingelstad.com/AGENTS.md, "The sites strip"). These tests build the site
// in memory and pin the strip's links, order and current-site marker.

const root = fileURLToPath(new URL("..", import.meta.url));
const vendored = JSON.parse(await readFile(new URL("../src/_data/sites.json", import.meta.url), "utf8"));
const stripSites = vendored.sites.filter((site) => site.in_sites_strip);

async function buildPages() {
  const eleventy = new Eleventy(`${root}src`, `${root}_site`, {
    configPath: `${root}eleventy.config.js`,
    quietMode: true,
  });
  const results = await eleventy.toJSON();
  return results.filter((page) => page.outputPath?.endsWith(".html"));
}

function stripOf(html) {
  const match = html.match(/<nav class="sites-strip"[\s\S]*?<\/nav>/);
  assert.ok(match, "page has no sites strip");
  return match[0];
}

function itemsOf(strip) {
  return [...strip.matchAll(/<li class="([^"]+)">\s*<a ([^>]*)>([^<]*)<\/a>/g)].map(([, classes, attrs, text]) => ({
    classes: classes.split(/\s+/),
    href: attrs.match(/href="([^"]*)"/)?.[1],
    current: /\baria-current="true"/.test(attrs),
    text,
  }));
}

const pages = await buildPages();

test("every HTML page opens its body with the sites strip", () => {
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const body = page.content.match(/<body[^>]*>\s*([\s\S]*)/)?.[1] ?? "";
    assert.match(body, /^<nav class="sites-strip" aria-label="Jamie's sites">/, `${page.url} does not open with the strip`);
    assert.equal(page.content.match(/class="sites-strip"/g).length, 1, `${page.url} has more than one strip`);
  }
});

test("the strip links the in_sites_strip sites in file order and marks Another Thing current", () => {
  const home = pages.find((page) => page.url === "/");
  const episode = pages.find((page) => /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/.test(page.url));
  assert.ok(home, "no home page");
  assert.ok(episode, "no episode page");

  for (const page of [home, episode]) {
    const items = itemsOf(stripOf(page.content));
    assert.deepEqual(
      items.map((item) => item.href),
      stripSites.map((site) => `${site.url}?ref=sites-strip-another`),
      `${page.url}: strip links`,
    );
    assert.ok(!items.some((item) => item.classes.includes("sites-strip__item--escape")), "Escaping Things is not in the strip");

    const current = items.filter((item) => item.current);
    assert.equal(current.length, 1, `${page.url}: exactly one current site`);
    assert.equal(current[0].href, "https://another.thingelstad.com/?ref=sites-strip-another");
    assert.equal(current[0].text, "Another Thing", "this site reads as it does on every other site");
    assert.ok(current[0].classes.includes("sites-strip__item--another"));
    assert.ok(current[0].classes.includes("sites-strip__item--current"));

    for (const [index, item] of items.entries()) {
      const site = stripSites[index];
      assert.ok(item.classes.includes(`sites-strip__item--${site.id}`));
      assert.equal(item.text, site.strip_label.replace(/'/g, "&#39;"));
      if (site.id !== "another") {
        assert.ok(!item.classes.includes("sites-strip__item--current"));
      }
    }
  }
});

test("vendored sites.json matches the shared copy", async (t) => {
  const sourceUrl = new URL(process.env.SITES_SOURCE || "../shared/sites.json", pathToFileURL(root));
  const shared = await readFile(sourceUrl, "utf8").catch(() => null);
  if (shared === null) {
    t.skip(`${fileURLToPath(sourceUrl)} is not checked out here (CI checks out only this repo); npm run sites:check covers it locally`);
    return;
  }
  const current = await readFile(new URL("../src/_data/sites.json", import.meta.url), "utf8");
  assert.equal(current, shared, "Vendored sites.json is stale. Run npm run sites:sync.");
});
