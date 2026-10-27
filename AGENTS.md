# AGENTS.md

Eleventy 3 site for **Another Thing**, a podcast by Jamie Thingelstad, at `another.thingelstad.com`. Served from S3 behind CloudFront (§ S3 and CloudFront) since 2026-10-26; GitHub Pages served it before.

## Role in the system

This is the **podcast publish surface** — one of the repos that work together
(see `librarian-thing/ALIGNMENT.md` for the full map — renamed from
`studio-thing` 2026-08-28). Specifically:

- **This repo owns publishing.** Episodes live in `content/episodes/`, their
  audio in the site stack's audio bucket (§ S3 and CloudFront), and the site builds the RSS feed (`/podcast.xml`) that
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
  feed and pages are served from S3 and CloudFront with no runtime tie to the Librarian.

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
- **`uploads/YYYY/`** — the cover art, served at `/uploads/YYYY/` via passthrough. Episode audio is not committed (`uploads/**/*.mp3` is git-ignored): it lives in the audio bucket at the same URL. Episode 1's MP3 left git on 2026-10-26; history keeps it.
- **`lib/loadEpisodes.js`** — reads episodes, takes each one's audio size and running time from its front matter (`audioBytes`, `audioSeconds`; from the MP3 via `music-metadata` only when the front matter lacks them and the file is in git), computes permalinks, and reads each episode's optional `.txt` transcript into `transcriptText`. Called only by `src/_data/episodes.js`.
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
- `cardVersion` — short hash for an episode card's `?v=` (§ Share cards)

## Adding an episode

1. Put `another-thing-N.mp3` in the audio bucket: place it at `uploads/YYYY/another-thing-N.mp3` (git-ignored), then `npm run audio:put -- uploads/YYYY/another-thing-N.mp3` as the cloud-engineer identity. It prints the two `audio*` lines for the front matter. WT Builder's send will do this for the episodes it publishes.
2. Create `content/episodes/00N-slug.md` with this frontmatter shape:
   ```yaml
   ---
   title: ...
   number: N
   slug: ...            # permalink slug (no episode number prefix)
   date: 2025-10-05T18:48:44-05:00
   audio: /uploads/YYYY/another-thing-N.mp3
   audioBytes: 13237856        # from audio:put (or WT Builder)
   audioSeconds: 635.352       # decimal seconds, same source
   transcript: 00N-slug.txt    # optional, sibling path
   summary: ...
   guid: https://another.thingelstad.com/YYYY/MM/DD/slug.html
   guidIsPermalink: true
   ---
   ```
3. Optionally drop a `.txt` transcript alongside the markdown (plain text, paragraphs separated by blank lines — the `paragraphs` filter handles the rest).
4. `audioBytes` and `audioSeconds` are the record the feed's `length` and `itunes:duration` come from; copy them from what `audio:put` prints, never estimate them. A build fails on an episode with audio and neither the two fields nor the file in git, and the AWS deploy refuses a feed whose enclosure is not in the audio bucket at that length.

`lib/loadEpisodes.js:12` is a **minimal custom frontmatter parser** — intentional, to avoid a YAML dep for a handful of fields. Do not swap it for `gray-matter` without reason. If you add a frontmatter field, extend that parser.

## URL preservation constraint (CRITICAL)

This site replaced a previous micro.blog deployment at the same domain. The following URLs are load-bearing for podcast directory subscriptions (Apple, Spotify, Overcast, etc. poll them) and **must not change**:

- `/podcast.xml` — canonical RSS feed
- `/YYYY/MM/DD/slug.html` — episode permalinks and RSS `<guid>` values
- `/uploads/YYYY/*.mp3` — episode audio enclosures
- `/uploads/YYYY/another-thing-3000.png` — channel cover art

The permalink shape is computed in `lib/loadEpisodes.js:38` (`computePermalink`). Frontmatter `guid` locks the RSS GUID independently so existing subscriptions stay valid even if a slug is later edited. Don't change the permalink structure or the GUID scheme without understanding the downstream impact on every subscriber's client.

Other micro.blog-era URLs that Google still knows (micro.blog's `/transcripts/YYYY/MM/DD/<post id>.html` transcript pages) are rows in `src/_data/legacyRedirects.js`. CloudFront answers each with a real 301 (§ S3 and CloudFront). `src/legacy-redirects.njk` still writes the stub GitHub Pages needed (an instant meta refresh plus `rel=canonical` to the new page); CloudFront never reaches it, and the hosting test checks the redirect map against it. Add a row when Search Console reports another 404 from the old site. The stubs carry no strip or h-card, and the page tests skip them.

## The sites strip

Every page on the base layout opens with the sites strip
(`src/_includes/partials/sites-strip.njk`, included first in `<body>` by
`layouts/base.njk`, above the site header). It is the same strip as on the blog,
Weekly Thing, Thingy and Things I've built, so its markup, class names, colours
and sizes are the shared contract in `thingelstad.com/AGENTS.md` ("The sites
strip"), not this site's palette; only the inner width and side padding follow
this site's header frame. Styles: the "sites strip" block in
`src/assets/css/main.css` (dark values under `prefers-color-scheme: dark`, as for
the rest of the site).

It renders at build time from `src/_data/sites.json`: sites with
`in_sites_strip` true, in file order; this site (`site.id`) gets
`sites-strip__item--current` and `aria-current="true"`. Every site, this one
included, reads as its `strip_label` ("Podcast" here too), so the wording
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
- No italics in the design (Jamie, 2026-10-22: "I really dislike italics with san
  serif fonts … I like the color and I like using font weight with san serif"). The
  titles, once slanted, stand upright in Inter Tight 800; pull quotes in show notes
  stand upright beside their crimson bar. `test/shared-type.test.js` fails on any
  `font-style: italic` in `main.css`. The shared Inter has no `cv11`/`ss01`, so the
  single-storey a and open digits that rsms.me's Inter gave are gone.

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
  `u-photo`, `p-name`, `owner.url` as an explicit `u-url` (u-photo turns off
  the implied one), and `owner.note` as `p-note`. Styles sit with the footer
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

## Share cards

Each episode page shares its card from cards.thingelstad.com (2026-10-25; Jamie: "Weekly Thing and Another Thing issues should get custom share images with cards.thingelstad.com solution"): `layouts/base.njk` sets `og:image` to `https://cards.thingelstad.com/another/<yyyy>/<mm>/<dd>/<slug>.png?v=<hash>`, where `v` (`cardVersion`) hashes the title, date, summary, number and running time. The card is the show's own (2026-10-25; Jamie: "make it rich and inviting and equal to the quality of the thing it is previewing"): slate with the three dots, "Episode N · date", the title and summary, and a crimson listen button with the running time ("Listen · 11 min"). It carries no photo, since the show's art is its own. Every other page keeps the show's artwork. The card maker reads only the page, so the episode `<article>` is an h-entry: `p-name`, `dt-published`, `p-summary`, `e-content` (the notes), `u-url`, and as `<data>` `p-episode` (the number) and `p-duration` (seconds, rounded). Keep those class names (cards.thingelstad.com `src/post.mjs` reads them). `test/share-card.test.js` pins both.

## Feeds and microformats

The home page and `/archive/` are h-feeds (2026-10-25, open-web audit G10). On `/archive/` the `<ol>` is the root; on the home page it is `<main>` (front matter `mainClass: h-feed`, because the latest card and the recent list are separate `main > section`s), named by the hero title's `p-name`. The latest card and every row are h-entries built on the markup readers already see: `p-name`, `u-url` (the row's link), `dt-published` (a `<time>` around the shown date) and `p-summary` where a summary shows. No other page sets `mainClass`, so episode pages stay h-entry roots. The head's `rel=alternate` links are the two RSS feeds, llms.txt and an episode's `.txt`: `index.json` is a `{show, episodes}` catalog, not a feed, and `application/json` is JSON Feed 1.0's discovery type, so it has no alternate (G9); llms.txt names it. `test/microformats.test.js` pins both.

## Deploy

`scripts/arrival.mjs` optionally reports a new episode to the publishing bus
after the healthy public deployment and a matching `/index.json` read-back.
It compares a known earlier episode; unknown baselines, unchanged builds and
regressions report nothing. The repository variable `SYNC_RECEIVED_BUS`
starts empty. Apply the sync stack's reviewed, source-scoped delivery-role
grant before enabling it. A reporting failure warns; polling is the backstop.
No activity, subscriber, transcript or body enters the receipt.

The GitHub Actions workflow at `.github/workflows/deploy.yml` runs `npm ci`, `npm test` and
`npm run build`, then its `deploy` job publishes the tested build to S3 behind CloudFront
(`npm run deploy:aws`, as the delivery role; `main` only).

The site moved from GitHub Pages on 2026-10-26 (Jamie: "Approved: move another.thingelstad.com to S3
and CloudFront with real 301 redirects, Pages kept until DNS cutover"). Both deployed until the
`another` CNAME moved to `dr9m1gmjoe1ul.cloudfront.net` the same evening; then the Pages job, `CNAME`
and episode 1's MP3 left the repo. Jamie unpublished the Pages site the same evening, as Weekly
Thing's; GitHub keeps only its settings, and `jthingelstad.github.io/another.thingelstad.com/` is a 301
to the domain.

## S3 and CloudFront

The same shape as Weekly Thing's (weekly.thingelstad.com `AGENTS.md`, "S3 and CloudFront"), plus the
audio. Three stacks, generated by `infra/templates.mjs` into `infra/generated/` (`npm run infra:generate`;
a test fails when the committed JSON is stale) and deployed **from this Mac as the cloud-engineer
identity** with `npm run infra -- certificate|site|delivery` (`--plan` prints the change set and
stops). `infra/deployment.json` records their names, tags and outputs.

- `another-certificate`: the ACM certificate, validated by a CNAME at Namecheap. DNS is Jamie's to edit.
  Keep the validation record: renewal needs it. The `another` record is a CNAME to the distribution's
  `cloudfront.net` name. As for Weekly Thing, ACM checks CAA along the CNAME chain, and github.io's CAA
  refuses Amazon, so `another` pointed at GitHub's A records while the certificate validated.
- `another-site`: two private, versioned buckets behind one CloudFront distribution with origin access
  control. The **site bucket** holds the build (old versions kept 90 days). The **audio bucket** holds
  the episode MP3s (old versions kept a year), served by the `/uploads/*.mp3` behaviour at the URLs every
  subscriber's client holds, uncompressed, with byte ranges as podcast clients ask. AWS's
  CachingOptimized policy (no query string in the key); security headers plus
  `Access-Control-Allow-Origin: *` as Pages sent (for an `Origin` request, which is when a browser
  reads it), with `Content-Range` exposed for web players; 403/404 serve `/404.html`; a 5xx alarm to
  `weekly-thing-librarian-alarms`. The alias and certificate attach only once the certificate is ISSUED
  (rerun `npm run infra -- site`).
- `another-delivery`: the role GitHub Actions assumes (`vars.AWS_DEPLOY_ROLE_ARN`), `main` only. It can
  publish into the site bucket, update the redirect store and clear the cache, and only read the audio
  bucket; it cannot change the stacks.

**The audio is not in git** (Jamie, 2026-10-26: "Not great for the audio files to be in git -- we can
and should change that to be more AWS proper"; the bucket at the same URLs was Jamie's pick over moving
it to files.thingelstad.com). An MP3 goes into the audio bucket once per episode, before its episode
file is committed: `npm run audio:put` by hand, WT Builder's send once it does the same. Nothing deletes
from the audio bucket, and the deploy never writes to it: it refuses unless every enclosure in the built
`podcast.xml` is there as `audio/mpeg` at the feed's `length`. A re-sent master keeps its URL
(`audio:put --replace`); the audio is a day in browsers and a year in CloudFront, and the commit that
carries the new `audioBytes` deploys, which clears the cache. Episode 1's MP3 was in git until the
cutover, because Pages could serve only what the repo held; history keeps it.

**Redirects are real 301s.** The build writes `_redirects.json` (`src/redirects-map.11ty.js`): every
`legacyRedirects.js` row with and without `.html`, and every episode page without its `.html` (Pages
served `/2025/10/05/how-do-you-start-a` as the page itself; here it is a 301 to the `.html`). Each
deploy copies it into the distribution's CloudFront key value store, and the viewer-request function
(`infra/viewer-request.mjs`) answers those paths with a 301 that keeps the query string, placed before
the target's `#transcript`. The same function sends a bare directory path to its slash form and serves
`index.html` for directory URLs; the extensionless files it passes through are its `FILES` (none today).
`test/aws-hosting.test.js` keeps the map equal to what the build writes. The stub pages, written for
Pages, are never reached on CloudFront.

**Content types and caching** are set per file by `scripts/publish-plan.mjs`: both feeds go out as
`application/rss+xml` (Pages said `application/xml`), the audio as `audio/mpeg` (Pages said
`audio/mp3`, which the feed's enclosure contradicted), Pagefind's index as bytes. Pages are five minutes
in browsers and a day in CloudFront; fonts and images a week.

`npm run deploy:aws` (`scripts/deploy-aws.mjs`) refuses unless the site stack's live template equals
`infra/generated/site.json`, so infrastructure goes out first, on its own. It checks the enclosures,
uploads the files whose MD5 changed (`--all` re-uploads everything, needed after a `publish-plan.mjs`
change), syncs the redirect store, deletes what the build no longer writes, clears the cache, and reads
the result back through the CloudFront domain (the front page as built, the feed's type, the first two
bytes of an episode as a 206, a micro.blog redirect, an episode without `.html`, the slash form, a 404).
Tinylytics refuses the `cloudfront.net` host, so analytics only count on the real domain.
