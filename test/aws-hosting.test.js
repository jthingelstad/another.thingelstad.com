import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import { parseFile } from "music-metadata";
import { viewerRequestCode, FILES } from "../infra/viewer-request.mjs";
import { certificate, site, delivery } from "../infra/templates.mjs";
import { cacheControlFor, contentTypeFor, enclosuresOf, isAudio } from "../scripts/publish-plan.mjs";
import loadEpisodes from "../lib/loadEpisodes.js";
import siteData from "../src/_data/site.js";

// The S3 and CloudFront hosting (AGENTS.md, "S3 and CloudFront"): the viewer-request function (run here
// with a stand-in key value store), the redirect map against what the build writes, how each file is
// typed and cached, the audio's front matter, and the committed templates matching their source.

const root = fileURLToPath(new URL("..", import.meta.url));

const store = {
  "/transcripts/2025/10/05/2437.html": "/2025/10/05/how-do-you-start-a.html#transcript",
  "/transcripts/2025/10/05/2437": "/2025/10/05/how-do-you-start-a.html#transcript",
  "/2025/10/05/how-do-you-start-a": "/2025/10/05/how-do-you-start-a.html",
};
const cf = {
  kvs: () => ({
    get: async (key) => {
      if (key in store) return store[key];
      throw new Error("Key not found");
    },
  }),
};
const handler = new Function("cf", viewerRequestCode.replace("import cf from 'cloudfront';", "") + "\nreturn handler;")(cf);
const request = (uri, querystring = {}) => handler({ request: { uri, querystring } });

test("a micro.blog URL is a 301 to its episode, the query before the fragment", async () => {
  const r = await request("/transcripts/2025/10/05/2437.html", { ref: { value: "google" } });
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "/2025/10/05/how-do-you-start-a.html?ref=google#transcript");
  const bare = await request("/transcripts/2025/10/05/2437");
  assert.equal(bare.headers.location.value, "/2025/10/05/how-do-you-start-a.html#transcript");
});

test("an episode without its .html is a 301 to the page, as Pages served it", async () => {
  const r = await request("/2025/10/05/how-do-you-start-a", { ref: { value: "x" } });
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, "/2025/10/05/how-do-you-start-a.html?ref=x");
  assert.equal((await request("/2025/10/05/how-do-you-start-a.html")).uri, "/2025/10/05/how-do-you-start-a.html");
});

test("directory URLs serve index.html; a bare path gets its slash; files pass", async () => {
  assert.equal((await request("/")).uri, "/index.html");
  assert.equal((await request("/archive/")).uri, "/archive/index.html");
  const bare = await request("/archive", { ref: { value: "x" } });
  assert.equal(bare.statusCode, 301);
  assert.equal(bare.headers.location.value, "/archive/?ref=x");
  assert.equal((await request("/podcast.xml")).uri, "/podcast.xml");
  assert.equal((await request("/uploads/2025/another-thing-3000.png")).uri, "/uploads/2025/another-thing-3000.png");
});

test("the feeds are RSS, the audio is audio/mpeg and is not published from the build", () => {
  const rss = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"';
  assert.match(contentTypeFor("podcast.xml", rss), /^application\/rss\+xml/);
  assert.match(contentTypeFor("feed.xml", rss), /^application\/rss\+xml/);
  assert.match(contentTypeFor("sitemap.xml", '<?xml version="1.0"?>\n<urlset'), /^application\/xml/);
  assert.match(contentTypeFor("2025/10/05/how-do-you-start-a.txt"), /^text\/plain; charset=utf-8/);
  assert.equal(contentTypeFor("uploads/2025/another-thing-1.mp3"), "audio/mpeg");
  assert.equal(contentTypeFor("CNAME", "another.thingelstad.com"), "application/octet-stream");
  assert.ok(isAudio("uploads/2025/another-thing-1.mp3"));
  assert.ok(!isAudio("uploads/2025/another-thing-3000.png"));
});

test("pages are short in browsers; the audio is a day there and a year in CloudFront", () => {
  assert.equal(cacheControlFor("index.html"), "public, max-age=300, s-maxage=86400");
  assert.equal(cacheControlFor("podcast.xml"), "public, max-age=300, s-maxage=86400");
  assert.equal(cacheControlFor("uploads/2025/another-thing-3000.png"), "public, max-age=604800");
  assert.equal(cacheControlFor("uploads/2025/another-thing-1.mp3"), "public, max-age=86400, s-maxage=31536000");
});

test("every episode's front matter carries its audio's size and running time, equal to an MP3 on disk", async () => {
  const raw = await readFile(new URL("../content/episodes/001-how-do-you-start-a-podcast.md", import.meta.url), "utf8");
  assert.match(raw, /^audioBytes: \d+$/m);
  assert.match(raw, /^audioSeconds: [\d.]+$/m);
  for (const episode of await loadEpisodes()) {
    assert.ok(episode.audioBytes > 0 && episode.durationSeconds > 0, `${episode.id} has no audio size or time`);
    const file = `${root}${episode.audio.slice(1)}`;
    const onDisk = await stat(file).catch(() => null);
    if (!onDisk) continue;
    assert.equal(episode.audioBytes, onDisk.size, `${episode.id}: audioBytes`);
    const seconds = (await parseFile(file, { duration: true })).format.duration;
    assert.ok(Math.abs(episode.durationSeconds - seconds) < 0.01, `${episode.id}: audioSeconds ${seconds}`);
  }
});

test("the redirect map names every redirect the build writes, and the function knows every extensionless file", async () => {
  const eleventy = new Eleventy(`${root}src`, `${root}_site`, { configPath: `${root}eleventy.config.js`, quietMode: true });
  const results = await eleventy.toJSON();
  const map = JSON.parse(results.find((page) => page.url === "/_redirects.json").content);
  const expected = {};
  for (const page of results.filter((p) => p.url.endsWith(".html") && p.url !== "/404.html")) {
    const refresh = page.content.match(/<meta http-equiv="refresh" content="0; url=([^"]+)">/);
    const target = refresh ? refresh[1].replace(siteData.url, "") : page.url;
    if (refresh) expected[page.url] = target;
    expected[page.url.replace(/\.html$/, "")] = target;
  }
  assert.ok(Object.keys(expected).length >= 3);
  assert.deepEqual(map, expected);

  const bare = results.map((page) => page.url).filter((url) => url && !url.endsWith("/") && !url.split("/").pop().includes("."));
  assert.deepEqual(bare.sort(), [...FILES].sort());

  const feed = results.find((page) => page.url === "/podcast.xml").content;
  const enclosures = enclosuresOf(feed, siteData.url);
  assert.ok(enclosures.length > 0);
  for (const enclosure of enclosures) {
    assert.match(enclosure.key, /^uploads\/\d{4}\/another-thing-\d+\.mp3$/);
    assert.ok(enclosure.length > 0, `${enclosure.url} has no length`);
  }
});

test("the committed templates are what infra/templates.mjs writes", async () => {
  for (const [name, body] of Object.entries({ certificate, site, delivery })) {
    const committed = JSON.parse(await readFile(new URL(`../infra/generated/${name}.json`, import.meta.url), "utf8"));
    assert.deepEqual(committed, body, `run npm run infra:generate (${name})`);
  }
});
