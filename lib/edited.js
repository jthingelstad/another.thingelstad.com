// When each page's own words last changed, for the sitemap's <lastmod>.
//
// pages: the last commit to a hand-written page's template and the partials
// and data it reads, keyed by its path. episodes: the last commit to an
// episode's notes or transcript (content/episodes/<id>.md and .txt), keyed by
// its id. The sitemap takes the newer of these and the episode dates a page
// shows. Layouts and CSS are left out: a restyle is not new content, and a
// lastmod that moves on every deploy is one Google learns to ignore.
//
// A shallow clone has one commit, which would date every page today, so it
// returns nothing and the sitemap falls back to the episode dates. CI checks
// out full history for this (.github/workflows/deploy.yml). The data file
// src/_data/edited.js hands it to the templates (Eleventy reads a data module
// with named exports as its namespace, so SOURCES lives here).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const EPISODES = "content/episodes/";

export const SOURCES = {
  "/": ["src/index.njk", "src/_includes/partials/player.njk", "src/_data/site.js", "src/_data/sites.json"],
  "/archive/": ["src/archive.njk"],
  "/search/": ["src/search.njk"],
  "/about/": ["src/about.njk", "src/_data/site.js", "src/_data/sites.json"],
  "/subscribe/": ["src/subscribe.njk", "src/_data/site.js"],
};

const git = (args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim();

export default function edited() {
  const result = { pages: {}, episodes: {} };
  try {
    if (git(["rev-parse", "--is-shallow-repository"]) !== "false") return result;
    for (const [page, files] of Object.entries(SOURCES)) {
      const date = git(["log", "-1", "--format=%cI", "--", ...files]);
      if (date) result.pages[page] = date;
    }
    let date = null;
    // git log runs newest first, so an episode's first date is its last edit.
    for (const line of git(["log", "--format=@%cI", "--name-only", "--", EPISODES]).split("\n")) {
      if (line.startsWith("@")) date = line.slice(1);
      const match = line.startsWith(EPISODES) && /^([^/]+)\.(md|txt)$/.exec(line.slice(EPISODES.length));
      if (match && date && !(match[1] in result.episodes)) result.episodes[match[1]] = date;
    }
  } catch {
    // no git: the sitemap uses the episode dates alone
  }
  return result;
}
