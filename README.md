# another.thingelstad.com

The home for **Another Thing**, a podcast by Jamie Thingelstad. Built with [Eleventy](https://www.11ty.dev/) and deployed to GitHub Pages.

## Adding a new episode

1. Drop the MP3 into `uploads/YYYY/`.
2. Create one markdown file in `content/episodes/`, named like `00N-slug.md`:

   ```markdown
   ---
   title: How do you start a podcast?
   number: 1
   slug: how-do-you-start-a
   date: 2025-10-05T18:48:44-05:00
   audio: /uploads/2025/another-thing-1.mp3
   transcript: 001-how-do-you-start-a-podcast.txt
   summary: Stepping into podcasting and trying my hand at something new.
   guid: https://another.thingelstad.com/2025/10/05/how-do-you-start-a.html
   guidIsPermalink: true
   ---

   Show notes go here as normal markdown.
   ```

3. Optionally drop a transcript text file alongside the markdown (referenced by `transcript:` in the frontmatter). Paragraphs are separated by blank lines.
4. Commit and push. GitHub Actions builds and deploys to Pages.

Duration and file size are read from the MP3 automatically at build time. The episode's permalink is computed from the publish date and slug (`/YYYY/MM/DD/slug.html`); the `guid` frontmatter field locks the RSS GUID independently so subscriptions stay valid even if a slug is later edited.

## Local development

```bash
npm install
npm run serve
```

Open http://localhost:8080.

## Build

```bash
npm run build
```

Runs Eleventy, then builds the Pagefind search index over the output in `_site/`.

## Architecture

- **Eleventy 3** with Nunjucks templates; ESM project (`"type": "module"`).
- **Markdown-per-episode**, one file in `content/episodes/`, with auto-derived audio metadata via `music-metadata`. No central JSON database.
- **Transcripts inline** on each episode page, below the show notes.
- **Pagefind** client-side search, indexed once per episode and reachable from `/search/`.
- **Tinylytics** for privacy-friendly analytics, per-episode kudos buttons, visitor country flags, and a play-event custom event fired the first time each episode is played.
- **GitHub Pages** with custom domain via `CNAME`. Deploy workflow at `.github/workflows/deploy.yml`.

## Feeds and machine-readable indexes

The site publishes the same content in several formats:

| URL | Format | Purpose |
| --- | --- | --- |
| `/podcast.xml` | RSS 2.0 + iTunes + Podcast Index | Podcast directories and apps |
| `/feed.xml` | RSS 2.0 + `content:encoded` | Plain feed readers |
| `/index.json` | JSON | Programmatic catalog of episodes |
| `/llms.txt` | Markdown | [llms.txt](https://llmstxt.org) index for LLMs |
| `/YYYY/MM/DD/slug.txt` | Markdown | Per-episode plain-text companion (show notes + full transcript) |
| `/sitemap.xml` | XML | Standard sitemap |

Each new episode automatically appears in all of these on the next build.

## URL preservation

The site replaces a previous micro.blog deployment at the same domain. The following URLs are preserved exactly to keep podcast directory subscriptions valid:

- `/podcast.xml` — canonical podcast RSS feed (Apple, Spotify, Overcast, etc. poll this URL)
- `/YYYY/MM/DD/slug.html` — episode permalinks and RSS `<guid>` values
- `/uploads/YYYY/*.mp3` — episode audio enclosures
- `/uploads/2025/another-thing-3000.png` — channel cover art

Permalink shape and GUID handling live in `lib/loadEpisodes.js`.

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs `npm ci && npm run build` and publishes `_site/` to GitHub Pages. The custom domain is set via the `CNAME` file at the repo root.
