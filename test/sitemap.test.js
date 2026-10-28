import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import loadEpisodes from "../lib/loadEpisodes.js";
import { SOURCES } from "../lib/edited.js";

// Every url in the sitemap carries a <lastmod> that says when the page's
// content last changed (2026-10-28): Google reads lastmod only on sites where
// it is accurate, never where it is always the build time.

const root = fileURLToPath(new URL("..", import.meta.url));
const eleventy = new Eleventy(`${root}src`, `${root}_site`, { configPath: `${root}eleventy.config.js`, quietMode: true });
const pages = await eleventy.toJSON();
const sitemap = pages.find((page) => page.url === "/sitemap.xml").content;
const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => ({
  loc: /<loc>([^<]+)<\/loc>/.exec(body)?.[1],
  lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(body)?.[1],
}));
const W3C = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

test("every sitemap url has a valid W3C lastmod, none in the future", () => {
  assert.ok(urls.length >= 6);
  for (const { loc, lastmod } of urls) {
    assert.match(lastmod ?? "", W3C, loc);
    assert.ok(Date.parse(lastmod) <= Date.now(), `${loc}: ${lastmod} is in the future`);
  }
});

test("the sitemap lists every page and every episode, and an episode's lastmod is never before it aired", async () => {
  const locs = urls.map(({ loc }) => loc);
  for (const path of ["/", "/archive/", "/search/", "/about/", "/subscribe/"]) {
    assert.ok(locs.includes(`https://another.thingelstad.com${path}`), path);
  }
  const episodes = await loadEpisodes();
  for (const episode of episodes) {
    const entry = urls.find(({ loc }) => loc === `https://another.thingelstad.com${episode.permalink}`);
    assert.ok(entry, episode.permalink);
    assert.ok(Date.parse(entry.lastmod) >= episode.publishDate.getTime(), episode.permalink);
  }
  const home = urls.find(({ loc }) => loc === "https://another.thingelstad.com/");
  assert.ok(Date.parse(home.lastmod) >= episodes[0].publishDate.getTime(), "the home page is never older than its newest episode");
});

test("every source a page dates itself by exists", () => {
  for (const [page, files] of Object.entries(SOURCES)) {
    for (const file of files) assert.ok(existsSync(`${root}${file}`), `${page}: ${file}`);
  }
});
