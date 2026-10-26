// Every redirect the site makes, path to target, for CloudFront: each deploy copies this map into the
// distribution's key value store and the viewer-request function answers these paths with a 301
// (infra/viewer-request.mjs). The deploy does not publish this file, and test/aws-hosting.test.js
// keeps it equal to what the build writes.
//
//   - the micro.blog URLs (src/_data/legacyRedirects.js), with and without .html;
//   - every episode page without its .html, which GitHub Pages served as the page itself.
export const data = {
  permalink: "/_redirects.json",
  eleventyExcludeFromCollections: true,
};

const bare = (path) => path.replace(/\.html$/, "");

export function render({ legacyRedirects, episodes }) {
  const map = {};
  for (const { from, to, anchor } of legacyRedirects) {
    map[from] = to + (anchor || "");
    map[bare(from)] = to + (anchor || "");
  }
  for (const episode of episodes) map[bare(episode.permalink)] = episode.permalink;
  return JSON.stringify(map, null, 2) + "\n";
}
