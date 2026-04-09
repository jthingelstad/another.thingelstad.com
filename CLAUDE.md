# CLAUDE.md

Eleventy 3 site for **Another Thing**, a podcast by Jamie Thingelstad. Deployed to GitHub Pages via `CNAME` → `another.thingelstad.com`.

## Commands

```bash
npm install         # install deps
npm run serve       # dev server with live reload
npm run build       # eleventy build + pagefind search index
npm run clean       # rm -rf _site
```

`npm run build` must succeed end-to-end before committing — the same command runs in CI-equivalent environments.

## Project shape

- **`src/`** — Eleventy input. Templates (`*.njk`), layouts (`_includes/layouts/`), partials (`_includes/partials/`), data (`_data/`), assets (`assets/css`, `assets/js`, `assets/images`).
- **`content/episodes/`** — one `.md` per episode with frontmatter; optional sibling `.txt` transcript.
- **`uploads/YYYY/`** — MP3s and cover art, served at `/uploads/YYYY/` via passthrough.
- **`lib/loadEpisodes.js`** — reads episodes, extracts MP3 duration + bytes via `music-metadata`, computes permalinks. Called by `src/_data/episodes.js` and `episodesWithTranscripts.js`.
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

## Search

Pagefind indexes elements marked `data-pagefind-body` (archive list items, episode pages, transcript pages). The archive page (`src/archive.njk`) wires up the Pagefind UI. The search index is built after Eleventy in `npm run build`.

## Deploy

GitHub Pages, custom domain via `CNAME` at the repo root (passthrough-copied to `_site/CNAME`). A GitHub Actions workflow is expected at `.github/workflows/` to run `npm ci && npm run build` and publish `_site/` — currently **not present** in this checkout.
