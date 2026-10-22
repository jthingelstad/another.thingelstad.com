// Vendors the canonical list of Jamie's sites (thingelstad.com
// shared/sites.json) into src/_data/sites.json, which the build renders as
// the "Jamie's sites" strip at the top of every page
// (src/_includes/partials/sites-strip.njk), and the type and colours the
// sites share (shared/tokens.css and shared/fonts/) byte for byte into
// src/assets/css/shared/. Mirrors thingy.thingelstad.com/web/scripts/sync-sites.mjs
// and weekly.thingelstad.com/scripts/sync-sites.mjs:
//
//   npm run sites:sync    copy from the sibling shared/ directory
//   npm run sites:check   fail if any vendored copy is stale
//
// SITES_SOURCE overrides the sites.json source path (relative to this repo's
// root); the shared type is read from the same directory. The default is
// ../shared/sites.json; it is relative on purpose because the thingelstad.com
// repos move as a unit. CI checks out only this repo, so the vendored copies
// are committed and the check runs locally.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = resolve(repoRoot, "src/_data/sites.json");
const siblingSource = "../shared/sites.json";
const sharedCssDir = resolve(repoRoot, "src/assets/css/shared");

// The shared type: tokens.css and the fonts it names (with their licences),
// as [source, target] pairs.
async function sharedTypeFiles(sharedDir) {
  const fonts = (await readdir(join(sharedDir, "fonts"))).filter((name) => /\.(woff2|txt)$/.test(name)).sort();
  return [
    [join(sharedDir, "tokens.css"), join(sharedCssDir, "tokens.css")],
    ...fonts.map((name) => [join(sharedDir, "fonts", name), join(sharedCssDir, "fonts", name)]),
  ];
}

async function syncSites({ check = false } = {}) {
  const source = resolve(repoRoot, process.env.SITES_SOURCE || siblingSource);
  const content = await readFile(source, "utf8");
  const data = JSON.parse(content);
  if (!Array.isArray(data.sites) || data.sites.length === 0) throw new Error(`${source} has no sites list.`);

  const typeFiles = await sharedTypeFiles(dirname(source));

  if (check) {
    const current = await readFile(targetPath, "utf8").catch(() => "");
    if (current !== content) throw new Error("Vendored sites.json is stale. Run npm run sites:sync.");
    for (const [from, to] of typeFiles) {
      const [want, have] = await Promise.all([readFile(from), readFile(to).catch(() => null)]);
      if (!have || !want.equals(have)) throw new Error(`Vendored ${relative(repoRoot, to)} is stale. Run npm run sites:sync.`);
    }
    // A font dropped from shared/ must not linger here either.
    const wanted = new Set(typeFiles.map(([, to]) => to));
    const vendoredFonts = await readdir(join(sharedCssDir, "fonts")).catch(() => []);
    for (const name of vendoredFonts.filter((file) => /\.(woff2|txt)$/.test(file))) {
      const path = join(sharedCssDir, "fonts", name);
      if (!wanted.has(path)) throw new Error(`Vendored ${relative(repoRoot, path)} is not in ${dirname(source)}. Remove it and run npm run sites:sync.`);
    }
    process.stdout.write(`sites.json and the shared type match ${dirname(source)}.\n`);
    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
  await mkdir(join(sharedCssDir, "fonts"), { recursive: true });
  for (const [from, to] of typeFiles) await writeFile(to, await readFile(from));
  process.stdout.write(`Synced ${data.sites.length} sites and ${typeFiles.length} shared type files from ${dirname(source)}.\n`);
}

syncSites({ check: process.argv.includes("--check") }).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
