import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile } from "music-metadata";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const episodesDir = resolve(projectRoot, "content", "episodes");

// Minimal frontmatter parser. Episodes use a small, well-defined frontmatter
// schema, so we avoid pulling in a YAML dependency for a handful of fields.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (value === "true") data[key] = true;
    else if (value === "false") data[key] = false;
    else if (value !== "" && /^-?\d+$/.test(value)) data[key] = Number(value);
    else data[key] = value;
  }
  return { data, body: match[2] };
}

function audioOnDisk(audioFile) {
  if (!audioFile) return null;
  if (/^https?:\/\//i.test(audioFile)) return null;
  return resolve(projectRoot, audioFile.replace(/^\//, ""));
}

function computePermalink(date, slug) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `/${yyyy}/${mm}/${dd}/${slug}.html`;
}

function llmPermalink(permalink) {
  return permalink.replace(/\.html$/, ".txt");
}

let cached = null;

export default async function loadEpisodes() {
  if (cached) return cached;

  let entries;
  try {
    entries = await readdir(episodesDir);
  } catch {
    cached = [];
    return cached;
  }

  const mdFiles = entries.filter((f) => extname(f) === ".md").sort();

  const episodes = await Promise.all(
    mdFiles.map(async (filename) => {
      const fullPath = join(episodesDir, filename);
      const raw = await readFile(fullPath, "utf8");
      const { data, body } = parseFrontmatter(raw);
      const stem = basename(filename, ".md");

      const date = data.date ? new Date(data.date) : new Date();
      const slug = data.slug || stem.replace(/^\d+-/, "");
      const permalink = data.permalink || computePermalink(date, slug);
      const guid = data.guid || `https://another.thingelstad.com${permalink}`;

      const onDisk = audioOnDisk(data.audio);
      let durationSeconds = null;
      let audioBytes = null;
      let audioMime = "audio/mpeg";
      if (onDisk) {
        try {
          const meta = await parseFile(onDisk, { duration: true });
          durationSeconds = meta.format.duration ?? null;
          const fileStat = await stat(onDisk);
          audioBytes = fileStat.size;
        } catch (err) {
          console.warn(`[episodes] could not read ${onDisk}:`, err.message);
        }
      }

      let transcriptText = null;
      if (data.transcript) {
        const transcriptPath = resolve(episodesDir, data.transcript);
        try {
          transcriptText = await readFile(transcriptPath, "utf8");
        } catch {
          // missing transcript is fine
        }
      }

      return {
        id: stem,
        number: data.number ?? null,
        title: data.title || stem,
        slug,
        date,
        publishDate: date,
        summary: data.summary || "",
        permalink,
        transcriptPermalink: transcriptText ? `${permalink}#transcript` : null,
        llmPermalink: llmPermalink(permalink),
        guid,
        guidIsPermalink: data.guidIsPermalink !== false,
        audio: data.audio || null,
        audioBytes,
        audioMime,
        durationSeconds,
        coverImage: data.coverImage || null,
        explicit: !!data.explicit,
        notesMarkdown: body.trim(),
        transcriptText,
      };
    }),
  );

  episodes.sort((a, b) => b.date - a.date);
  cached = episodes;
  return cached;
}
