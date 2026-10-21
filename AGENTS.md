# AGENTS.md

Eleventy 3 site for **Another Thing**, a podcast by Jamie Thingelstad. Deployed to GitHub Pages via `CNAME` → `another.thingelstad.com`.

## Role in the system

This is the **podcast publish surface** — one of the repos that work together
(see `librarian-thing/ALIGNMENT.md` for the full map — renamed from
`studio-thing` 2026-08-28). Specifically:

- **This repo owns publishing.** Episodes live in `content/episodes/`, audio in
  `uploads/`, and the site builds the RSS feed (`/podcast.xml`) that
  directories poll. (WT Builder makes Another Thing since 2026-10-11
  (`/another`, which replaced `at-builder`) and commits each episode here in
  one send; that send has not run yet, so episodes so far were added by hand
  per § Adding an episode.)
- **`librarian-thing` owns the corpus.** Its CI imports
  `content/episodes/` into `librarian-thing/data/podcast/another-thing/episodes/`,
  builds a separate podcast corpus, and uploads it for Thingy
  (`thingy.thingelstad.com`) to query. The corpus side of any episode is
  the Librarian's concern; this repo only ships the episode publicly.
- **No live dependency.** Unlike Thingy (a live client of the Librarian
  Lambda), this is a static publishing surface — once the build deploys, the
  feed and pages are served from GitHub Pages with no runtime tie to the Librarian.

If an editorial change here affects what Thingy answers about a podcast
episode, that's the Librarian's pipeline picking it up on the next corpus build — not
something this repo coordinates.

## Commands

```bash
npm install         # install deps
npm run serve       # dev server with live reload
npm run build       # eleventy build + pagefind search index
npm test            # node --test (docs, sites strip, vendored sites.json)
npm run sites:sync  # vendor ../shared/sites.json into src/_data/sites.json
npm run sites:check # fail if the vendored sites.json is stale
npm run clean       # rm -rf _site
```

`npm run build` must succeed end-to-end before committing — the same command runs in CI-equivalent environments.

## Project shape

- **`src/`** — Eleventy input. Templates (`*.njk`), layouts (`_includes/layouts/`), partials (`_includes/partials/`), data (`_data/`), assets (`assets/css`, `assets/js`, `assets/images`).
- **`content/episodes/`** — one `.md` per episode with frontmatter; optional sibling `.txt` transcript.
- `librarian-thing` imports `content/episodes/` into its `data/podcast/another-thing/episodes/`
  for the Librarian/Thingy podcast corpus. This repo remains the publishing surface;
  corpus ownership stays with the Librarian.
- **`uploads/YYYY/`** — MP3s and cover art, served at `/uploads/YYYY/` via passthrough.
- **`lib/loadEpisodes.js`** — reads episodes, extracts MP3 duration + bytes via `music-metadata`, computes permalinks. Called by `src/_data/episodes.js` and `episodesWithTranscripts.js`.
- **`src/_data/sites.json`** — vendored copy of `thingelstad.com/shared/sites.json`, the canonical list of Jamie's sites. Never edit it here: edit the shared file, then `npm run sites:sync` (`scripts/sync-sites.mjs`). `src/_data/site.js` `id` (`another`) is this site's id in it.
- **`eleventy.config.js`** — directory config, passthrough copy, and all custom filters.
- **`_site/`** — build output, git-ignored.

ESM project (`"type": "module"` in `package.json`). Use `import`, not `require`.

## Custom filters (defined in `eleventy.config.js`)

- `readableDate(fmt?)` — luxon, default `"LLLL d, yyyy"`
- `isoDate`, `rfc822Date` — luxon-formatted for sitemap and RSS
- `hms` — `HH:MM:SS` / `MM:SS` from seconds (player and RSS `itunes:duration`)
- `friendlyDuration` — `"11 min"` / `"1 hr 15 min"` from seconds
- `xmlEscape`, `cdata` — XML output safety
- `renderMarkdown` — markdown-it (html + linkify + typographer)
- `paragraphs` — splits plain-text transcripts on blank lines, wraps in `<p>`

## Adding an episode

1. Drop `another-thing-N.mp3` into `uploads/YYYY/`.
2. Create `content/episodes/00N-slug.md` with this frontmatter shape:
   ```yaml
   ---
   title: ...
   number: N
   slug: ...            # permalink slug (no episode number prefix)
   date: 2025-10-05T18:48:44-05:00
   audio: /uploads/YYYY/another-thing-N.mp3
   transcript: 00N-slug.txt    # optional, sibling path
   summary: ...
   guid: https://another.thingelstad.com/YYYY/MM/DD/slug.html
   guidIsPermalink: true
   ---
   ```
3. Optionally drop a `.txt` transcript alongside the markdown (plain text, paragraphs separated by blank lines — the `paragraphs` filter handles the rest).
4. Duration, file size, and MIME type are read from the MP3 at build time. Do not hand-enter them.

`lib/loadEpisodes.js:12` is a **minimal custom frontmatter parser** — intentional, to avoid a YAML dep for a handful of fields. Do not swap it for `gray-matter` without reason. If you add a frontmatter field, extend that parser.

## URL preservation constraint (CRITICAL)

This site replaced a previous micro.blog deployment at the same domain. The following URLs are load-bearing for podcast directory subscriptions (Apple, Spotify, Overcast, etc. poll them) and **must not change**:

- `/podcast.xml` — canonical RSS feed
- `/YYYY/MM/DD/slug.html` — episode permalinks and RSS `<guid>` values
- `/uploads/YYYY/*.mp3` — episode audio enclosures
- `/uploads/YYYY/another-thing-3000.png` — channel cover art

The permalink shape is computed in `lib/loadEpisodes.js:38` (`computePermalink`). Frontmatter `guid` locks the RSS GUID independently so existing subscriptions stay valid even if a slug is later edited. Don't change the permalink structure or the GUID scheme without understanding the downstream impact on every subscriber's client.

## Jamie's sites strip

Every page on the base layout opens with the "Jamie's sites" strip
(`src/_includes/partials/sites-strip.njk`, included first in `<body>` by
`layouts/base.njk`, above the site header). It is the same strip as on the blog,
Weekly Thing, Thingy and Things I've built, so its markup, class names, colours
and sizes are the shared contract in `thingelstad.com/AGENTS.md` ("The sites
strip"), not this site's palette; only the inner width and side padding follow
this site's header frame. Styles: the "Jamie's sites strip" block in
`src/assets/css/main.css` (dark values under `prefers-color-scheme: dark`, as for
the rest of the site).

It renders at build time from `src/_data/sites.json`: sites with
`in_sites_strip` true, in file order; this site (`site.id`) gets
`sites-strip__item--current` and `aria-current="true"`. Every site, this one
included, reads as its `strip_label` ("Another Thing" here too), so the wording
matches every other site; every link carries `?ref=sites-strip-another` so
Tinylytics' Sources report on the destination shows the visits this strip sent.
`test/sites-strip.test.js` builds the site in memory and pins the links and the
current marker, and compares the vendored file with `../shared/sites.json` when
that sibling is checked out (CI checks out only this repo, so there it is
reported as skipped; run `npm run sites:check` locally).

The footer's "The family" column and the home and About page lists still read
the hand-kept `family` list in `src/_data/site.js` (blog and Weekly Thing only).

## Search

Pagefind indexes elements marked `data-pagefind-body` (archive list items, episode pages, transcript pages). The archive page (`src/archive.njk`) wires up the Pagefind UI. The search index is built after Eleventy in `npm run build`.

## Deploy

GitHub Pages, custom domain via `CNAME` at the repo root (passthrough-copied to `_site/CNAME`). The GitHub Actions workflow at `.github/workflows/deploy.yml` runs `npm ci`, `npm test` and `npm run build` and publishes `_site/`.
