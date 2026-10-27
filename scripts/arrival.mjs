// A publication receipt for the episode the public catalog actually serves.
// Bodies, transcripts and listener information never leave this selector.
export function catalogEpisode(catalog) {
  const episodes = Array.isArray(catalog?.episodes) ? catalog.episodes : [];
  return episodes.flatMap((episode) => {
    if (!Number.isSafeInteger(episode.number) || episode.number < 1 || !Number.isFinite(Date.parse(episode.publishedAt))) return [];
    try {
      const url = new URL(episode.urls?.html);
      if (url.origin !== 'https://another.thingelstad.com' || url.username || url.password || url.search || url.hash) return [];
      return [{ id: String(episode.number), at: new Date(episode.publishedAt).toISOString(), url: url.href }];
    } catch { return []; }
  }).sort((a, b) => Number(b.id) - Number(a.id))[0] ?? null;
}

export function episodeReceipt({ previous, expected, publicCatalog, checkedAt }) {
  const before = catalogEpisode(previous), built = catalogEpisode(expected), served = catalogEpisode(publicCatalog);
  if (!before || !built || !served || Number(built.id) <= Number(before.id) || served.id !== built.id || served.at !== built.at || served.url !== built.url) return null;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(checkedAt) || !Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString().replace('.000Z', 'Z') !== checkedAt) return null;
  return { Source: 'another', DetailType: 'received', Detail: JSON.stringify({ system: 'another', kind: 'episode', id: served.id, at: checkedAt, url: served.url, via: 'site-deploy' }) };
}

export async function publicCatalog(url, fetcher = fetch) {
  try {
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function announceEpisode({ busName, region, previous, expected, origin, checkedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), fetcher = fetch, put, warning = console.warn }) {
  if (!busName) return 'disabled';
  const catalog = await publicCatalog(`${origin}/index.json`, fetcher);
  const receipt = episodeReceipt({ previous, expected, publicCatalog: catalog, checkedAt });
  if (!receipt) return 'no-new-verified-episode';
  try {
    if (!put) {
      const { EventBridgeClient, PutEventsCommand } = await import('@aws-sdk/client-eventbridge');
      const client = new EventBridgeClient({ region, maxAttempts: 2 });
      put = (entry) => client.send(new PutEventsCommand({ Entries: [entry] }), { abortSignal: AbortSignal.timeout(5000) });
    }
    const result = await put({ ...receipt, EventBusName: busName, Time: new Date(checkedAt) });
    if (result?.FailedEntryCount !== 0 || result.Entries?.length !== 1 || !result.Entries[0].EventId || result.Entries[0].ErrorCode) throw new Error('Not acknowledged');
    return 'reported';
  } catch {
    warning('::warning::The episode arrival was not acknowledged; the public deployment is healthy.');
    return 'report-failed';
  }
}
