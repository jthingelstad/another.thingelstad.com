// Publish the built site (_site/) to S3 behind CloudFront: the files that changed, the redirect map
// into the key value store, the pages the build no longer writes removed, then the cache cleared and
// the result read back through CloudFront. The episode audio is not part of it: it is in the audio
// bucket already (WT Builder's send, or scripts/put-audio.mjs), and a feed whose enclosures are not
// all there, at the length the feed promises, is not published.
//
// CI runs it as the delivery role after the browser tests pass (.github/workflows/deploy.yml); it also
// runs from this Mac as the cloud-engineer identity. Either way it refuses to publish when the site
// stack's live template differs from infra/generated/site.json: infrastructure changes go out first,
// on their own (`npm run infra -- site`).
//
//   node scripts/deploy-aws.mjs          upload what changed (by MD5) and remove what is gone
//   node scripts/deploy-aws.mjs --all    upload every file, after a change to publish-plan.mjs
//
// Once the result reads back, the pages whose bytes changed go to IndexNow (scripts/indexnow.mjs); a
// failed ping is logged and never fails the deploy.
import { CloudFormationClient, DescribeStacksCommand, GetTemplateCommand } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, CreateInvalidationCommand, waitUntilInvalidationCompleted } from '@aws-sdk/client-cloudfront';
import { DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { enclosuresOf, publishPlan } from './publish-plan.mjs';
import site from '../src/_data/site.js';
import { announceEpisode, publicCatalog } from './arrival.mjs';
import { changedPageUrls, pingIndexNow } from './indexnow.mjs';

const ROOT = '_site';
const deployment = JSON.parse(readFileSync('infra/deployment.json', 'utf8'));
const region = deployment.region;
const all = process.argv.includes('--all');

const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
const allowed = [':assumed-role/ProjectsCloudEngineer/', ':assumed-role/another-delivery-DeploymentRole-'];
if (identity.Account !== deployment.account || !allowed.some((role) => identity.Arn.includes(role)))
  throw new Error(`Unexpected AWS identity ${identity.Arn}`);

const cloudformation = new CloudFormationClient({ region });
const stack = (await cloudformation.send(new DescribeStacksCommand({ StackName: deployment.stacks.site }))).Stacks[0];
if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus))
  throw new Error(`${deployment.stacks.site} is not ready: ${stack.StackStatus}`);
const live = (await cloudformation.send(new GetTemplateCommand({ StackName: deployment.stacks.site }))).TemplateBody;
if (!isDeepStrictEqual(JSON.parse(live), JSON.parse(readFileSync('infra/generated/site.json', 'utf8'))))
  throw new Error('The site stack differs from infra/generated/site.json. Deploy the infrastructure change first.');
const out = Object.fromEntries(stack.Outputs.map((o) => [o.OutputKey, o.OutputValue]));
const bucket = out.SiteBucket;
const audioBucket = out.AudioBucket;
const preview = `https://${out.CloudFrontDomain}`;
const receiptBus = process.env.SYNC_RECEIVED_BUS;
const previousCatalog = receiptBus ? await publicCatalog(`${preview}/index.json`) : null;

// A build missing its core files is not published.
const plan = publishPlan(ROOT);
const keys = new Set(plan.map((file) => file.key));
const required = [
  'index.html', '404.html', 'podcast.xml', 'feed.xml', 'sitemap.xml', 'archive/index.html',
  'pagefind/pagefind.js', site.coverImage.slice(1)
];
const absent = required.filter((key) => !keys.has(key));
if (absent.length) throw new Error(`The build is incomplete: ${absent.join(', ')}`);
const redirects = JSON.parse(readFileSync(`${ROOT}/_redirects.json`, 'utf8'));
const bad = Object.entries(redirects).filter(([from, to]) => !/^\/./.test(from) || !/^(\/|https:\/\/)/.test(to));
if (bad.length) throw new Error(`Malformed redirects: ${JSON.stringify(bad.slice(0, 3))}`);

// Every enclosure the feed names is in the audio bucket as MP3, at the length the feed gives it.
const s3 = new S3Client({ region, maxAttempts: 5 });
const enclosures = enclosuresOf(readFileSync(`${ROOT}/podcast.xml`, 'utf8'), site.url);
if (!enclosures.length) throw new Error('The feed names no enclosures');
const missing = [];
for (const enclosure of enclosures) {
  if (!enclosure.key?.startsWith('uploads/') || !enclosure.length) {
    missing.push(`${enclosure.url} is not an /uploads/ URL with a length`);
    continue;
  }
  const head = await s3.send(new HeadObjectCommand({ Bucket: audioBucket, Key: enclosure.key })).catch(() => null);
  if (!head) missing.push(`${enclosure.key} is not in the audio bucket`);
  else if (head.ContentLength !== enclosure.length || head.ContentType !== 'audio/mpeg')
    missing.push(`${enclosure.key} is ${head.ContentLength} bytes of ${head.ContentType}; the feed says ${enclosure.length}`);
}
if (missing.length) throw new Error(`The feed's audio is not ready: ${missing.join('; ')}`);

// Upload what changed. A single-part upload's ETag is its MD5.
const existing = new Map();
let token;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
  for (const object of page.Contents ?? []) existing.set(object.Key, object.ETag?.replaceAll('"', ''));
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
const md5 = (path) => createHash('md5').update(readFileSync(path)).digest('hex');
const fresh = plan.filter((file) => existing.get(file.key) !== md5(file.path));
const changed = all ? plan : fresh;
// Files before pages and the front page last (publishPlan's order), a batch at a time.
for (let i = 0; i < changed.length; i += 16) {
  await Promise.all(
    changed.slice(i, i + 16).map((file) =>
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: file.key,
          Body: readFileSync(file.path),
          ContentType: file.contentType,
          CacheControl: file.cacheControl
        })
      )
    )
  );
}
console.log(`Uploaded ${changed.length} of ${plan.length} files.`);

// The redirect map. The key value store API signs with SigV4A, which the AWS CLI does natively, so it
// goes through the CLI; UpdateKeys takes 50 changes a call, each call naming the store's current ETag.
const cli = (...args) =>
  JSON.parse(execFileSync('aws', ['cloudfront-keyvaluestore', ...args, '--region', region, '--output', 'json'], { encoding: 'utf8' }));
const store = out.RedirectStoreArn;
let etag = cli('describe-key-value-store', '--kvs-arn', store).ETag;
const current = new Map();
let next;
do {
  const page = cli('list-keys', '--kvs-arn', store, ...(next ? ['--next-token', next] : []));
  for (const item of page.Items ?? []) current.set(item.Key, item.Value);
  next = page.NextToken;
} while (next);
const changes = [
  ...Object.entries(redirects)
    .filter(([from, to]) => current.get(from) !== to)
    .map(([Key, Value]) => ({ put: { Key, Value } })),
  ...[...current.keys()].filter((key) => !(key in redirects)).map((Key) => ({ delete: { Key } }))
];
for (let i = 0; i < changes.length; i += 50) {
  const batch = changes.slice(i, i + 50);
  const puts = batch.flatMap((c) => (c.put ? [c.put] : []));
  const deletes = batch.flatMap((c) => (c.delete ? [c.delete] : []));
  etag = cli(
    'update-keys', '--kvs-arn', store, '--if-match', etag,
    ...(puts.length ? ['--puts', JSON.stringify(puts)] : []),
    ...(deletes.length ? ['--deletes', JSON.stringify(deletes)] : [])
  ).ETag;
}
console.log(`Redirects: ${Object.keys(redirects).length}, ${changes.length} changed.`);

// Remove what the build no longer writes. The bucket keeps old versions for 90 days.
const stale = [...existing.keys()].filter((key) => !keys.has(key));
for (let i = 0; i < stale.length; i += 1000) {
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true }
    })
  );
}
console.log(`Removed ${stale.length} files the build no longer writes.`);

const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
const invalidation = await cloudfront.send(
  new CreateInvalidationCommand({
    DistributionId: out.DistributionId,
    InvalidationBatch: {
      CallerReference: `${process.env.GITHUB_SHA ?? 'local'}-${Date.now()}`,
      Paths: { Quantity: 1, Items: ['/*'] }
    }
  })
);
await waitUntilInvalidationCompleted(
  { client: cloudfront, maxWaitTime: 900 },
  { DistributionId: out.DistributionId, Id: invalidation.Invalidation.Id }
);

// Read it back through the distribution: the front page as built, the feed with its type, the first
// bytes of an episode's audio, a micro.blog redirect, an episode without its .html, the slash form and
// a missing page. The key value store takes a few seconds to reach the edges.
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const [redirectFrom, redirectTo] = Object.entries(redirects).find(([from]) => from.startsWith('/transcripts/'));
const [bareFrom, bareTo] = Object.entries(redirects).find(([from, to]) => to === `${from}.html`);
const withQuery = (to, query) => (to.includes('#') ? to.replace('#', `${query}#`) : to + query);
const [audio] = enclosures;
const checks = [
  async () => {
    const r = await fetch(`${preview}/`);
    return r.ok && sha(Buffer.from(await r.arrayBuffer())) === sha(readFileSync(`${ROOT}/index.html`)) || 'front page differs from the build';
  },
  async () => {
    const r = await fetch(`${preview}/podcast.xml`);
    return (r.ok && r.headers.get('content-type')?.startsWith('application/rss+xml')) || `/podcast.xml is ${r.status} ${r.headers.get('content-type')}`;
  },
  async () => {
    const r = await fetch(`${preview}/${audio.key}`, { headers: { range: 'bytes=0-1' } });
    await r.arrayBuffer();
    return (
      (r.status === 206 && r.headers.get('content-type') === 'audio/mpeg' && r.headers.get('content-range') === `bytes 0-1/${audio.length}`) ||
      `/${audio.key} answers a range with ${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-range')}`
    );
  },
  async () => {
    const r = await fetch(`${preview}${redirectFrom}?ref=check`, { redirect: 'manual' });
    return (r.status === 301 && r.headers.get('location') === withQuery(redirectTo, '?ref=check')) || `${redirectFrom} is ${r.status} ${r.headers.get('location')}`;
  },
  async () => {
    const r = await fetch(`${preview}${bareFrom}`, { redirect: 'manual' });
    return (r.status === 301 && r.headers.get('location') === bareTo) || `${bareFrom} is ${r.status} ${r.headers.get('location')}`;
  },
  async () => {
    const r = await fetch(`${preview}/archive`, { redirect: 'manual' });
    return (r.status === 301 && r.headers.get('location') === '/archive/') || `/archive is ${r.status}`;
  },
  async () => {
    const r = await fetch(`${preview}/2025/01/01/not-an-episode.html`);
    return r.status === 404 || `a missing page is ${r.status}`;
  }
];
let failures = [];
for (let attempt = 0; attempt < 8; attempt++) {
  failures = (await Promise.all(checks.map((check) => check().catch((error) => error.message)))).filter((r) => r !== true);
  if (!failures.length) break;
  await delay(10_000);
}
if (failures.length) throw new Error(`Published site check failed: ${failures.join('; ')}`);
console.log(`Verified ${process.env.GITHUB_SHA ?? 'local build'} at ${preview}`);
if (receiptBus) {
  try {
    const expected = JSON.parse(readFileSync(`${ROOT}/index.json`, 'utf8'));
    console.log(`Sync receipt: ${await announceEpisode({ busName: receiptBus, region, previous: previousCatalog, expected, origin: preview })}`);
  } catch { console.warn('::warning::The episode catalog could not be verified for sync; the site is deployed.'); }
}
// Only the pages whose bytes changed (by MD5, even under --all), and only those in the sitemap.
try {
  const urls = changedPageUrls(fresh.map((file) => file.key), readFileSync(`${ROOT}/sitemap.xml`, 'utf8'));
  console.log(await pingIndexNow(urls));
} catch (error) { console.warn(`::warning::IndexNow was skipped (${error.message}); the site is deployed.`); }
