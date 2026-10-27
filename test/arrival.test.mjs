import assert from 'node:assert/strict';
import { test } from 'node:test';
import { announceEpisode, catalogEpisode, episodeReceipt } from '../scripts/arrival.mjs';

const checkedAt = '2026-10-28T02:04:00Z';
const catalog = (number) => ({ episodes: [{ number, publishedAt: '2026-10-28T02:00:00Z', urls: { html: `https://another.thingelstad.com/2026/10/28/episode-${number}.html` }, title: 'fixture-title-canary', transcriptText: 'fixture-private-canary' }] });

test('a verified new episode emits only its public id, URL and arrival time', () => {
  const expected = catalog(2), untouched = structuredClone(expected);
  const event = episodeReceipt({ previous: catalog(1), expected, publicCatalog: expected, checkedAt });
  assert.equal(event.Source, 'another');
  assert.equal(event.DetailType, 'received');
  assert.deepEqual(JSON.parse(event.Detail), { system: 'another', kind: 'episode', id: '2', at: checkedAt, url: 'https://another.thingelstad.com/2026/10/28/episode-2.html', via: 'site-deploy' });
  assert.deepEqual(expected, untouched);
  assert.doesNotMatch(event.Detail, /title-canary|private-canary|transcript/);
  for (const previous of [null, catalog(2), catalog(3), { episodes: [] }]) assert.equal(episodeReceipt({ previous, expected, publicCatalog: expected, checkedAt }), null);
  assert.equal(episodeReceipt({ previous: catalog(1), expected, publicCatalog: catalog(1), checkedAt }), null);
  assert.equal(catalogEpisode({ episodes: 'malformed' }), null);
  assert.equal(catalogEpisode({ episodes: [{ ...expected.episodes[0], urls: { html: 'https://fixture-secret@another.thingelstad.com/x' } }] }), null);
});

test('the episode transport is off by default, refuses unknown reads and requires the per-entry acknowledgement', async () => {
  const sent = [], warnings = [];
  const options = { busName: 'fixture-bus', region: 'us-east-1', previous: catalog(1), expected: catalog(2), origin: 'https://fixture.invalid', checkedAt, fetcher: async () => ({ ok: true, json: async () => catalog(2) }), put: async (entry) => { sent.push(entry); return { FailedEntryCount: 0, Entries: [{ EventId: 'fixture-event' }] }; }, warning: (w) => warnings.push(w) };
  assert.equal(await announceEpisode({ ...options, busName: '', fetcher: () => { throw new Error('Disabled must not read'); } }), 'disabled');
  assert.equal(await announceEpisode({ ...options, fetcher: async () => { throw new Error('private-error'); } }), 'no-new-verified-episode');
  assert.equal(sent.length, 0);
  assert.equal(await announceEpisode(options), 'reported');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].EventBusName, 'fixture-bus');
  assert.equal(await announceEpisode({ ...options, put: async () => ({ FailedEntryCount: 1 }) }), 'report-failed');
  assert.equal(await announceEpisode({ ...options, put: async () => { throw new Error('private-error'); } }), 'report-failed');
  assert.doesNotMatch(warnings.join(''), /private-error|private-canary/);
});
