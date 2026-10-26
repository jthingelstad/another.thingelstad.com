// What a deploy to S3 publishes, and how each file is served: its content type and Cache-Control.
// This is the control GitHub Pages never gave the site (it typed files by extension, so the feeds went
// out as application/xml and the audio as audio/mp3, and cached everything ten minutes).
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

// Files only GitHub Pages read (the site left Pages on 2026-10-26), and the redirect map, which goes to
// the key value store instead.
export const NOT_PUBLISHED = new Set(['CNAME', '.nojekyll', '_redirects.json']);
// The episode audio is served from the audio bucket (infra/templates.mjs AUDIO_PATH), never from the
// build: an MP3 a send still commits, or one sitting in uploads/ on this Mac, is left out here.
export const isAudio = (key) => /^uploads\/.*\.mp3$/i.test(key);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json'
};

// XML is read, not guessed: /podcast.xml and /feed.xml are RSS, served as application/rss+xml (which
// CloudFront compresses); the sitemap is plain XML.
export function contentTypeFor(key, head = '') {
  const ext = extname(key).toLowerCase();
  if (ext === '.xml' || ext === '') {
    if (/<rss[\s>]/.test(head)) return 'application/rss+xml; charset=utf-8';
    if (ext === '.xml' || head.startsWith('<?xml')) return 'application/xml; charset=utf-8';
  }
  // Pagefind's index files (.pf_fragment, .pf_index, .pf_meta, .pagefind) are gzip bytes it unpacks itself.
  return TYPES[ext] ?? 'application/octet-stream';
}

// Browsers keep a page five minutes; CloudFront keeps it a day, and every deploy clears CloudFront.
// Fonts and images change name or ?v= when they change, so browsers keep them a week. The audio
// (scripts/put-audio.mjs and WT Builder's send) is a day in browsers and a year in CloudFront: a
// re-sent master keeps its URL, and the commit that goes with it deploys, which clears the cache.
export const AUDIO_CACHE_CONTROL = 'public, max-age=86400, s-maxage=31536000';
export function cacheControlFor(key) {
  if (/\.mp3$/i.test(key)) return AUDIO_CACHE_CONTROL;
  if (/\.(woff2?|png|jpe?g|webp|svg|ico)$/i.test(key)) return 'public, max-age=604800';
  return 'public, max-age=300, s-maxage=86400';
}

function walk(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(root, path);
    return entry.isFile() ? [relative(root, path).split(sep).join('/')] : [];
  });
}

// Every published file with its type and caching, in the order a deploy writes them: files first, then
// pages, the front page last, so no page goes out before what it loads.
export function publishPlan(root) {
  const rank = (key) => (key === 'index.html' ? 2 : key.endsWith('.html') ? 1 : 0);
  return walk(root)
    .filter((key) => !NOT_PUBLISHED.has(key) && !isAudio(key))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((key) => {
      const path = join(root, key);
      const head = readFileSync(path).subarray(0, 512).toString('utf8');
      return { key, path, contentType: contentTypeFor(key, head), cacheControl: cacheControlFor(key) };
    });
}

// The enclosures a built feed names, as audio bucket keys with the length the feed promises.
export function enclosuresOf(feedXml, siteUrl) {
  return [...feedXml.matchAll(/<enclosure url="([^"]+)"(?: length="(\d+)")?/g)].map(([, url, length]) => ({
    url,
    key: url.startsWith(`${siteUrl}/`) ? url.slice(siteUrl.length + 1) : null,
    length: length ? Number(length) : null
  }));
}
