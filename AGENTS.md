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
npm test            # node --test (docs, sites strip, shared type, vendored copies)
npm run sites:sync  # vendor ../shared/ (sites.json, tokens.css, fonts/)
npm run sites:check # fail if any vendored copy is stale
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
- **`lib/loadEpisodes.js`** — reads episodes, extracts MP3 duration + bytes via `music-metadata`, computes permalinks, and reads each episode's optional `.txt` transcript into `transcriptText`. Called only by `src/_data/episodes.js`.
- **`src/_data/sites.json`** — vendored copy of `thingelstad.com/shared/sites.json`, the canonical list of Jamie's sites. Never edit it here: edit the shared file, then `npm run sites:sync` (`scripts/sync-sites.mjs`). `src/_data/site.js` `id` (`another`) is this site's id in it.
- **`src/assets/css/shared/`** — vendored copy of `thingelstad.com/shared/tokens.css` and `shared/fonts/` (§ The shared type). Never edit it here either; `npm run sites:sync` copies it with `sites.json`.
- **`eleventy.config.js`** — directory config, passthrough copy, and all custom filters.
- **`_site/`** — build output, git-ignored.

ESM project (`"type": "module"` in `package.json`). Use `import`, not `require`.

## Custom filters (defined in `eleventy.config.js`)

- `readableDate(fmt?)` — luxon, default `"LLLL d, yyyy"`
- `isoDate`, `rfc822Date` — luxon-formatted for sitemap and RSS
- `hms` — `H:MM:SS` / `MM:SS` from seconds (the player's total time)
- `hmsLong` — always `HH:MM:SS` from seconds (RSS `itunes:duration` in `podcast.xml.njk`)
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

The footer has no list of sites: its "The family" column was removed on
2026-10-21 because the strip carries every site. The home page's "More from
Jamie" cards and the About page's "The family" list render from the same
`sites.json`: every `in_sites_strip` site except this one, in file order, as
`strip_label` with its `description`. There is no hand-kept list in
`src/_data/site.js` any more.

## The shared type

The site is set in the type all of Jamie's sites share (`thingelstad.com/AGENTS.md`,
"Shared type and colour"), moved onto it on 2026-10-22 as Weekly Thing was.
`src/assets/css/shared/tokens.css` and its fonts are a byte-for-byte copy of
thingelstad.com `shared/tokens.css` and `shared/fonts/`, vendored with `sites.json`
by `npm run sites:sync` and checked by `npm run sites:check` and
`test/shared-type.test.js`. `layouts/base.njk` preloads the two latin woff2 files
and links `tokens.css` before `main.css`; no font host (rsms.me is gone).

- Faces by role in `main.css`: `--font-heading` (Inter Tight, at `--weight-heading`,
  800, and `--jt-tracking-heading`), `--font-body`, `--font-ui` and `--font-label`
  (Inter), `--font-code` (the system mono). Never name a face in `main.css`; only
  the strip does, because its values are the contract.
- Sizes are the blog's scale: `--jt-size-base` body (19px, 18px on phones), labels
  and eyebrows `--jt-size-label` (14px) at `--jt-tracking-label`, dates
  `--jt-size-meta`, nav and buttons `--jt-size-ui`, blurbs and the footer
  `--jt-size-small`. Nothing is below 14px, Pagefind included
  (`--pagefind-ui-scale: 1`); the test fails on a smaller size.
- The frame is `--jt-frame` (1120px) with 24px gutters inside it: blocks that pad
  themselves take `--container`, rows inside a padded block (strip, header, hero,
  footer) take `--container-inner`, so every edge lines up at 1072px of content.
  The episode and page column is the blog's 720px measure.
- The titles stay italic, Another Thing's own look. Inter Tight has no italic, so
  the browser slants it; the italic titles get `word-spacing: 0.1em` because the
  slanted face's narrow spaces closed up. The shared Inter has no `cv11`/`ss01`,
  so the single-storey a and open digits that rsms.me's Inter gave are gone.

## Colours and favicon

The accent is Another Thing crimson, the `--jt-another*` colours in
`thingelstad.com/shared/tokens.css`; it replaced the cover art's orange-red on
2026-10-22 (Jamie: "Approved: phase 2 colours, Another Thing to crimson ...").
`main.css` carries it as `--accent` (the fill: buttons, the play button,
selection; white on it 6.8:1), `--accent-hover` (`#cc1548`, white on it
5.6:1), `--accent-text` (links and marks on the page: `#b3123f`, `#f58aa3` in
dark mode) and `--accent-soft` (the hero tint: `#fbeef2`, `#2b1820` dark).
Text and marks use `--accent-text`, never `--accent`: the fill is only 2.4:1
on the dark ground. The slate `--navy-*` palette still comes from the cover art.

`src/assets/images/favicon.svg` is a crimson tile with three dots, two pale
(`#f7a8ba`, 3.7:1 on the tile) and the last white (6.8:1). `layouts/base.njk`
loads it as `favicon.svg?v=2` so browsers refetch it; bump the number whenever
the icon changes. The cover art (`/uploads/2025/another-thing-3000.png`, also
the apple-touch-icon and the feed artwork) still has its orange-red third dot;
changing it is Jamie's call.

## Jamie and the links to the other sites

These follow `thingelstad.com/AGENTS.md` ("Jamie on every site", "Links between
the sites"):

- The footer's "A podcast by Jamie Thingelstad" is the shared h-card, built from
  `owner` in `sites.json`: `owner.avatar` (the bird photo) as a 28px round
  `u-photo`, `p-name`, and `owner.note` as `p-note`. Styles sit with the footer
  rules in `main.css`. `layouts/base.njk` puts a `<link rel="me">` in `<head>`
  for each `owner.rel_me`. Identity links never carry a `ref`.
- Every template link to another strip site carries `?ref=another-<placement>`:
  `another-family` (home cards), `another-about` (About prose and list),
  `another-episode` (the episode page's "Explore with Thingy", appended as
  `&ref=` after the encoded `?explore=` URL). The strip keeps
  `?ref=sites-strip-another`. Episode show notes and transcripts are content
  and are never rewritten to add refs.
- Copy that says how long Jamie has written says "since 2004" or
  "twenty-plus years", never 2000 or 25 years.

## Search

Pagefind indexes only elements marked `data-pagefind-body`, and the one such element is the episode `<article>` in `src/_includes/layouts/episode.njk` (transcripts render inside it, under `#transcript`, so they are indexed with their episode). The search page (`src/search.njk`, `/search/`) loads and wires up the Pagefind UI; the archive page does not. The search index is built after Eleventy in `npm run build`.

## Deploy

GitHub Pages, custom domain via `CNAME` at the repo root (passthrough-copied to `_site/CNAME`). The GitHub Actions workflow at `.github/workflows/deploy.yml` runs `npm ci`, `npm test` and `npm run build` and publishes `_site/`.
