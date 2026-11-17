import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import site from "../src/_data/site.js";

const expected = new Map([
  ["Apple Podcasts", "https://podcasts.apple.com/us/podcast/another-thing/id1844244418"],
  ["Spotify", "https://open.spotify.com/show/7FJA3cHPujeBoQV8WSoPdB"],
  ["Pocket Casts", "https://pocketcasts.com/podcast/another-thing/3d748f00-8562-013e-dd82-02e76e4f8b0f"],
]);

test("subscribe configuration identifies Another Thing's verified listings", () => {
  for (const [name, url] of expected) {
    assert.equal(site.subscribe.find((entry) => entry.name === name)?.url, url);
  }
});

const root = fileURLToPath(new URL("..", import.meta.url));
const eleventy = new Eleventy(`${root}src`, `${root}_site`, {
  configPath: `${root}eleventy.config.js`,
  quietMode: true,
});
const pages = (await eleventy.toJSON()).filter(
  (page) => page.outputPath?.endsWith(".html") && !page.content.includes('http-equiv="refresh"'),
);

test("subscribe cards and every footer use the verified directory links", () => {
  assert.ok(pages.some((page) => page.url === "/subscribe/"));
  for (const page of pages) {
    for (const url of expected.values()) {
      assert.ok(page.content.includes(`href="${url}"`), `${page.url}: missing ${url}`);
    }
    assert.doesNotMatch(page.content, /podcasts\.apple\.com\/us\/podcast\/another-thing\/id1849923890/);
    assert.doesNotMatch(page.content, /open\.spotify\.com\/show\/4xWUS5KWelgIkKJoogERDL/);
    assert.doesNotMatch(page.content, /pca\.st\/itunes\/1849923890/);
  }
});
