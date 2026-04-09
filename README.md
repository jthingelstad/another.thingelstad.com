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
   ---

   Show notes go here as normal markdown.
   ```

3. Optionally drop a transcript text file alongside the markdown (referenced by `transcript:` in the frontmatter).
4. Commit and push. GitHub Actions builds and deploys.

Duration and file size are read from the MP3 automatically at build time. The episode's permalink and RSS GUID are computed from the publish date and slug, following the `/YYYY/MM/DD/slug.html` shape used by the original micro.blog hosting so existing podcast directory subscriptions stay intact.

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

Outputs to `_site/`. Includes a Pagefind search index.

## Architecture

- **Eleventy 3** with Nunjucks templates
- **Markdown-per-episode** with auto-derived audio metadata via `music-metadata`
- **No central JSON database**: episodes live as standalone markdown files in `content/episodes/`
- **Pagefind** for client-side search across episodes and transcripts
- **GitHub Pages** with custom domain via `CNAME`

## URL preservation

The site replaces a previous micro.blog deployment at the same domain. The following URLs are preserved exactly to keep podcast directory subscriptions valid:

- `/podcast.xml`: canonical RSS feed (Apple, Spotify, etc. poll this URL)
- `/2025/10/05/how-do-you-start-a.html`: episode 1 permalink and GUID
- `/uploads/2025/another-thing-1.mp3`: episode 1 audio
- `/uploads/2025/another-thing-3000.png`: channel cover art
