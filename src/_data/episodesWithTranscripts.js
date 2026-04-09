import loadEpisodes from "../../lib/loadEpisodes.js";

export default async function () {
  const all = await loadEpisodes();
  return all.filter((e) => e.transcriptText);
}
