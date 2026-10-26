// The viewer-request CloudFront Function (cloudfront-js-2.0), kept as source here so the tests can run
// it with a stand-in for the key value store. It runs on the site's pages, not on the audio
// (/uploads/*.mp3 has its own behaviour, infra/templates.mjs).
//
// Redirects are real 301s. Their map is the build's _redirects.json (src/redirects-map.njk), copied
// into the distribution's key value store by each deploy, so a redirect added to the build needs no
// infrastructure change. It holds two kinds of path, both looked up exactly as requested:
//
//   - the micro.blog URLs Google still knows (src/_data/legacyRedirects.js), such as
//     /transcripts/2025/10/05/2437.html, whose target may carry a fragment (#transcript);
//   - every .html page without its extension (/2025/10/05/how-do-you-start-a), which GitHub Pages
//     served as the page itself, sent to the .html URL.
//
// A redirect keeps the query string as the viewer sent it (?ref= anywhere), placed before the
// target's fragment.
//
// S3 behind Origin Access Control serves no directory indexes, so "/archive/" is rewritten to its
// index.html and "/archive" is sent to the slash form. A path whose last segment has a dot is a file
// and passes through, and so do the extensionless files the build writes (FILES, which a test keeps
// equal to the build: there are none today).
export const FILES = [];

export const viewerRequestCode = `import cf from 'cloudfront';

const redirects = cf.kvs();
const files = ${JSON.stringify(Object.fromEntries(FILES.map((file) => [file, true])))};

function search(querystring) {
  var parts = [];
  for (var name in querystring) {
    var item = querystring[name];
    var values = item.multiValue ? item.multiValue : [item];
    for (var i = 0; i < values.length; i++) parts.push(values[i].value === '' ? name : name + '=' + values[i].value);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function moved(target, querystring) {
  var hash = target.indexOf('#');
  var location = hash === -1
    ? target + search(querystring)
    : target.slice(0, hash) + search(querystring) + target.slice(hash);
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location } } };
}

async function lookup(key) {
  try {
    return await redirects.get(key);
  } catch (missing) {
    return null;
  }
}

async function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (files[uri]) return request;
  var bare = !uri.endsWith('/') && !uri.split('/').pop().includes('.');
  if (uri !== '/' && (bare || uri.endsWith('/') || uri.endsWith('.html'))) {
    var to = await lookup(uri);
    if (!to && bare) to = await lookup(uri + '/');
    if (to) return moved(to, request.querystring);
  }
  if (bare) return moved(uri + '/', request.querystring);
  if (uri.endsWith('/')) request.uri = uri + 'index.html';
  return request;
}
`;
