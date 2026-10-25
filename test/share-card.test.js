import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";

// Each episode shares its card from cards.thingelstad.com, which draws it
// from the page's h-entry; every other page shares the show's artwork.

const root = fileURLToPath(new URL("..", import.meta.url));

async function buildPages() {
  const eleventy = new Eleventy(`${root}src`, `${root}_site`, {
    configPath: `${root}eleventy.config.js`,
    quietMode: true,
  });
  const results = await eleventy.toJSON();
  return results.filter((page) => page.outputPath?.endsWith(".html"));
}

const ogImage = (html) => html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];

test("an episode is an h-entry and shares its own card", async () => {
  const pages = await buildPages();
  const episodes = pages.filter((page) => /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.html$/.test(page.url));
  assert.ok(episodes.length > 0, "no episode pages built");
  for (const { url, content } of episodes) {
    assert.match(content, /<article class="episode h-entry"/, url);
    for (const property of ["p-name", "dt-published", "p-summary", "u-url"]) assert.match(content, new RegExp(`class="[^"]*\\b${property}\\b`), `${url} ${property}`);
    assert.match(ogImage(content), new RegExp(`^https://cards\\.thingelstad\\.com/another${url.replace(".html", "")}\\.png\\?v=[0-9a-f]{10}$`), url);
    // Its number and running time, for the card's kicker and listen button.
    assert.match(content, /<data class="p-episode" value="[1-9]\d*"><\/data>/, `${url} p-episode`);
    assert.match(content, /<data class="p-duration" value="[1-9]\d*"><\/data>/, `${url} p-duration`);
  }
  for (const url of ["/", "/about/", "/archive/"]) {
    const page = pages.find((p) => p.url === url);
    assert.equal(ogImage(page.content), "https://another.thingelstad.com/uploads/2025/another-thing-3000.png", url);
  }
});
