import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import loadEpisodes from "../lib/loadEpisodes.js";

// The open web (thingelstad.com/AGENTS.md, "Shared principles"): the home page
// and /archive/ are h-feeds with an h-entry per episode, the episode pages are
// the full h-entries, and the only feeds the head advertises are feeds.

const root = fileURLToPath(new URL("..", import.meta.url));

async function build({ config } = {}) {
  const eleventy = new Eleventy(`${root}src`, `${root}_site`, {
    configPath: `${root}eleventy.config.js`,
    quietMode: true,
    config,
  });
  return eleventy.toJSON();
}

const episodes = await loadEpisodes();
const pages = await build();
// Redirect stubs for old micro.blog URLs (src/legacy-redirects.njk) are not pages.
const html = pages.filter((page) => page.outputPath?.endsWith(".html") && !page.content.includes('http-equiv="refresh"'));
const pageAt = (url) => html.find((page) => page.url === url);

const iso = (episode) => episode.publishDate.toISOString();
// A title as the page writes it (Nunjucks escapes it), as a regular expression.
const titleIn = (title) =>
  title
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const head = (content) => content.match(/<head>[\s\S]*?<\/head>/)[0];
const blocks = (content, open, tag) =>
  [...content.matchAll(new RegExp(`${open}[\\s\\S]*?</${tag}>`, "g"))].map(([block]) => block);

// One feed entry's markup: its name, link and date, from the visible row.
function assertEntry(block, episode, where) {
  assert.match(block, /class="[^"]*\bh-entry\b/, `${where}: not an h-entry`);
  assert.match(block, new RegExp(`class="[^"]*\\bu-url\\b[^"]*" href="${episode.permalink}"`), `${where}: u-url`);
  assert.match(block, new RegExp(`class="[^"]*\\bp-name\\b[^"]*">(?:<a [^>]*>)?${titleIn(episode.title)}<`), `${where}: p-name`);
  assert.match(block, new RegExp(`<time class="dt-published" datetime="${iso(episode)}">`), `${where}: dt-published`);
}

test("no page advertises the index.json catalog as a feed, and llms.txt still names it", () => {
  for (const { url, content } of html) {
    assert.doesNotMatch(head(content), /type="application\/json"/, `${url} has a JSON alternate`);
    assert.doesNotMatch(head(content), /index\.json/, `${url} links index.json`);
  }
  const llms = pages.find((page) => page.url === "/llms.txt");
  assert.match(llms.content, /^- \[[^\]]+\]\(https:\/\/another\.thingelstad\.com\/index\.json\)/m);
});

test("/archive/ is an h-feed with an h-entry for every episode", () => {
  const { content } = pageAt("/archive/");
  assert.equal(content.match(/class="[^"]*\bh-feed\b/g)?.length, 1, "one h-feed");
  assert.match(content, /<ol class="archive__list h-feed">/);
  const rows = blocks(content, '<li class="archive__item h-entry">', "li");
  assert.equal(rows.length, episodes.length);
  rows.forEach((row, i) => {
    assertEntry(row, episodes[i], `/archive/ row ${i}`);
    if (episodes[i].summary) assert.match(row, /class="archive__summary p-summary"/);
  });
});

test("the home page is one h-feed, named by its title, with the latest episode as an h-entry", () => {
  const { content } = pageAt("/");
  assert.equal(content.match(/class="[^"]*\bh-feed\b/g)?.length, 1, "one h-feed");
  assert.match(content, /<main id="main" class="h-feed">/);
  assert.match(content, /<h1 class="hero__title p-name">Another Thing<\/h1>/);
  const [card] = blocks(content, '<article class="latest__card h-entry">', "article");
  assertEntry(card, episodes[0], "latest card");
  assert.match(card, /class="card__summary p-summary"/);
});

test("with more than one episode, each recent row on the home page is an h-entry", async () => {
  // The site has one episode today, so the recent list is not built. Add an
  // older one: Eleventy appends config global data to the _data array, so it
  // lands last, where the newest-first list would put it.
  const last = episodes.at(-1);
  const permalink = "/2025/01/01/an-earlier-episode.html";
  const earlier = {
    ...last,
    number: last.number - 1,
    title: "An earlier episode",
    slug: "an-earlier-episode",
    permalink,
    llmPermalink: permalink.replace(/\.html$/, ".txt"),
    transcriptPermalink: last.transcriptText ? `${permalink}#transcript` : null,
    guid: `https://another.thingelstad.com${permalink}`,
    publishDate: new Date(last.publishDate.getTime() - 7 * 86400000),
  };
  const all = [...episodes, earlier];
  const built = await build({ config: (eleventyConfig) => eleventyConfig.addGlobalData("episodes", [earlier]) });
  const { content } = built.find((page) => page.url === "/");
  assert.equal(content.match(/class="[^"]*\bh-feed\b/g)?.length, 1, "one h-feed");
  assertEntry(blocks(content, '<article class="latest__card h-entry">', "article")[0], all[0], "latest card");
  const rows = blocks(content, '<li class="episode-list__item h-entry">', "li");
  const recent = all.slice(1, 6);
  assert.equal(rows.length, recent.length, "one row per recent episode");
  rows.forEach((row, i) => assertEntry(row, recent[i], `recent row ${i}`));
});

test("only the home page and /archive/ carry an h-feed, so episode pages stay h-entry roots", () => {
  for (const { url, content } of html) {
    if (url === "/" || url === "/archive/") continue;
    assert.doesNotMatch(content, /\bh-feed\b/, url);
    assert.match(content, /<main id="main">/, url);
  }
});
