import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";

// Tinylytics (2026-11-02): one script for every site, named by data-site. The
// widgets (kudos, countries) and events are set in the site's Tinylytics
// settings, not in the URL, so the tag takes no query. Each tag sends its own
// page view, so a page carries exactly one and never the old /embed/ form.

const root = fileURLToPath(new URL("..", import.meta.url));
const SITE = "dU_bEtHmyUV_xnbDz6zH";
const TAG = `<script defer src="https://tinylytics.app/js/script.js" data-site="${SITE}"></script>`;

const eleventy = new Eleventy(`${root}src`, `${root}_site`, {
  configPath: `${root}eleventy.config.js`,
  quietMode: true,
});
const pages = (await eleventy.toJSON()).filter(
  (page) => page.outputPath?.endsWith(".html") && !page.content.includes('http-equiv="refresh"'),
);

test("every page loads the Tinylytics script once, in its new form", () => {
  assert.ok(pages.length > 0);
  for (const page of pages) {
    assert.equal(page.content.split(TAG).length - 1, 1, `${page.url}: expected one Tinylytics tag`);
    assert.doesNotMatch(page.content, /tinylytics\.app\/embed\//, `${page.url}: old Tinylytics embed`);
  }
});
