// URLs from the micro.blog deployment that no longer exist here, each with its new home. Two things
// read this list: src/redirects-map.11ty.js puts each in the map CloudFront answers with a 301
// (infra/viewer-request.mjs), and src/legacy-redirects.njk writes the meta-refresh stub GitHub Pages
// needed, kept as a fallback the hosting test checks the map against. Add a row when Search Console reports another 404 from the old site.
export default [
  { from: "/transcripts/2025/10/05/2437.html", to: "/2025/10/05/how-do-you-start-a.html", anchor: "#transcript" },
];
