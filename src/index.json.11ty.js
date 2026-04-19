export const data = {
  permalink: "/index.json",
  eleventyExcludeFromCollections: true,
};

export function render({ episodes, site }) {
  const out = {
    show: {
      title: site.title,
      description: site.description,
      url: site.url,
      author: site.author.name,
      language: site.language,
      coverImage: `${site.url}${site.coverImage}`,
      feeds: {
        podcast: `${site.url}/podcast.xml`,
        rss: `${site.url}/feed.xml`,
        json: `${site.url}/index.json`,
      },
      llms: {
        index: `${site.url}/llms.txt`,
      },
    },
    episodes: episodes.map((ep) => ({
      number: ep.number,
      title: ep.title,
      slug: ep.slug,
      summary: ep.summary,
      date: ep.publishDate.toISOString().slice(0, 10),
      publishedAt: ep.publishDate.toISOString(),
      durationSeconds: ep.durationSeconds,
      guid: ep.guid,
      hasTranscript: Boolean(ep.transcriptText),
      urls: {
        html: `${site.url}${ep.permalink}`,
        text: `${site.url}${ep.llmPermalink}`,
        transcript: ep.transcriptPermalink ? `${site.url}${ep.transcriptPermalink}` : null,
        audio: ep.audio ? `${site.url}${ep.audio}` : null,
      },
      audioBytes: ep.audioBytes,
      audioMime: ep.audioMime,
    })),
  };
  return JSON.stringify(out, null, 2);
}
