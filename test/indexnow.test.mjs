// IndexNow after a deploy (AGENTS.md, "S3 and CloudFront"): which changed files become URLs, that a failed
// ping never throws, and that the key file is served as the bare key and listed nowhere.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import { HOST, KEY, KEY_LOCATION, changedPageUrls, pingIndexNow, publicUrl } from "../scripts/indexnow.mjs";
import site from "../src/_data/site.js";

const root = fileURLToPath(new URL("..", import.meta.url));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://another.thingelstad.com/</loc></url>
  <url><loc>https://another.thingelstad.com/archive/</loc></url>
  <url><loc>https://another.thingelstad.com/about/</loc></url>
  <url>
    <loc>https://another.thingelstad.com/2025/10/05/how-do-you-start-a.html</loc>
    <lastmod>2025-10-05T18:48:44.000-05:00</lastmod>
  </url>
</urlset>`;

test("the host is the site's", () => {
  assert.equal(`https://${HOST}`, site.url);
});

test("a built file maps to its public URL", () => {
  assert.equal(publicUrl("index.html"), "https://another.thingelstad.com/");
  assert.equal(publicUrl("archive/index.html"), "https://another.thingelstad.com/archive/");
  assert.equal(publicUrl("2025/10/05/how-do-you-start-a.html"), "https://another.thingelstad.com/2025/10/05/how-do-you-start-a.html");
  assert.equal(publicUrl("404.html"), "https://another.thingelstad.com/404.html");
});

test("only changed pages the sitemap lists are sent, once each and sorted", () => {
  const changed = [
    "2025/10/05/how-do-you-start-a.html",
    "index.html",
    "archive/index.html",
    "assets/css/main.css",
    "uploads/2025/another-thing-3000.png",
    "pagefind/fragment/en_1.pf_fragment",
    "pagefind/pagefind.js",
    "podcast.xml",
    "feed.xml",
    "index.json",
    "llms.txt",
    "2025/10/05/how-do-you-start-a.txt",
    "404.html",
    "transcripts/2025/10/05/2437.html", // a micro.blog redirect stub
    "_redirects.json",
    `${KEY}.txt`,
  ];
  assert.deepEqual(changedPageUrls(changed, sitemap), [
    "https://another.thingelstad.com/",
    "https://another.thingelstad.com/2025/10/05/how-do-you-start-a.html",
    "https://another.thingelstad.com/archive/",
  ]);
  assert.deepEqual(changedPageUrls(["assets/css/main.css", "pagefind/pagefind.js"], sitemap), []);
  assert.deepEqual(changedPageUrls([], sitemap), []);
});

test("nothing changed sends nothing; a dry run prints the protocol's body", async () => {
  const post = () => { throw new Error("must not post"); };
  assert.match(await pingIndexNow([], { post }), /nothing sent/);
  const url = "https://another.thingelstad.com/2025/10/05/how-do-you-start-a.html";
  const dry = await pingIndexNow([url], { post, dryRun: true });
  const body = JSON.parse(dry.slice(dry.indexOf("{")));
  assert.deepEqual(body, { host: "another.thingelstad.com", key: KEY, keyLocation: KEY_LOCATION, urlList: [url] });
});

test("200 and 202 are accepted; any other answer or a network failure warns and never throws", async () => {
  const urls = ["https://another.thingelstad.com/"];
  const sent = [];
  const answer = (status) => async (url, init) => { sent.push([url, init]); return { status }; };
  assert.match(await pingIndexNow(urls, { post: answer(200) }), /^IndexNow: 200/);
  assert.match(await pingIndexNow(urls, { post: answer(202) }), /^IndexNow: 202/);
  assert.equal(sent[0][0], "https://api.indexnow.org/indexnow");
  assert.equal(sent[0][1].method, "POST");
  assert.match(sent[0][1].headers["content-type"], /^application\/json/);
  assert.ok(sent[0][1].signal instanceof AbortSignal);
  for (const status of [400, 403, 422, 429, 500]) assert.match(await pingIndexNow(urls, { post: answer(status) }), /^::warning::.*deployed/);
  assert.match(await pingIndexNow(urls, { post: async () => { throw new TypeError("fetch failed"); } }), /^::warning::.*deployed/);
});

test("the key file the site serves is exactly the key", async () => {
  assert.match(KEY, /^[a-zA-Z0-9-]{8,128}$/);
  assert.equal(await readFile(`${root}static/${KEY}.txt`, "utf8"), KEY);
  assert.equal(KEY_LOCATION, `https://another.thingelstad.com/${KEY}.txt`);
  const config = await readFile(`${root}eleventy.config.js`, "utf8");
  assert.ok(config.includes(`"static/${KEY}.txt": "${KEY}.txt"`), "the key file is copied to the site root");
});

test("the key is in no sitemap, feed, llms.txt, catalog or page", async () => {
  const eleventy = new Eleventy(`${root}src`, `${root}_site`, { configPath: `${root}eleventy.config.js`, quietMode: true });
  const results = await eleventy.toJSON();
  const outputs = results.filter((page) => page.outputPath);
  for (const name of ["sitemap.xml", "podcast.xml", "feed.xml", "llms.txt", "index.json"])
    assert.ok(outputs.some((page) => page.outputPath.endsWith(`/${name}`)), `${name} is built`);
  for (const page of outputs) assert.ok(!page.content.includes(KEY), `${page.outputPath} names the key`);
});
