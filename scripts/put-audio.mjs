// Put an episode's MP3 into the audio bucket, at the key its URL names, from this Mac as the
// cloud-engineer identity. WT Builder's send does the same for the episodes it publishes; this is the
// hand route (episodes published by hand, and episode 1, which was in git).
//
//   npm run audio:put -- uploads/2025/another-thing-1.mp3            refuses to replace different audio
//   npm run audio:put -- uploads/2025/another-thing-1.mp3 --replace  a new master at the same URL
//
// The key is the path given, so the file must sit where its URL says: uploads/YYYY/another-thing-N.mp3.
// It prints the audioBytes and audioSeconds the episode's front matter carries.
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { parseFile } from 'music-metadata';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AUDIO_CACHE_CONTROL } from './publish-plan.mjs';

const deployment = JSON.parse(readFileSync('infra/deployment.json', 'utf8'));
const region = deployment.region;
const [file] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const replace = process.argv.includes('--replace');
if (!file || !/^uploads\/\d{4}\/another-thing-\d+\.mp3$/.test(file))
  throw new Error('Usage: npm run audio:put -- uploads/YYYY/another-thing-N.mp3 [--replace]');
if (!deployment.audioBucket) throw new Error('No audio bucket in infra/deployment.json: run npm run infra -- site first');

const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
if (identity.Account !== deployment.account || !identity.Arn.includes(':assumed-role/ProjectsCloudEngineer/'))
  throw new Error(`Run as the cloud-engineer identity, not ${identity.Arn}`);

const body = readFileSync(file);
const md5 = createHash('md5').update(body).digest('hex');
const s3 = new S3Client({ region, maxAttempts: 5 });
const there = await s3.send(new HeadObjectCommand({ Bucket: deployment.audioBucket, Key: file })).catch((error) => {
  if (error.$metadata?.httpStatusCode === 404) return null;
  throw error;
});
const thereMd5 = there?.ETag?.replaceAll('"', '');
if (thereMd5 === md5) console.log(`${file}: already in the audio bucket`);
else if (there && !replace) throw new Error(`${file}: different audio is already there; pass --replace for a new master`);
else {
  await s3.send(
    new PutObjectCommand({
      Bucket: deployment.audioBucket,
      Key: file,
      Body: body,
      ContentType: 'audio/mpeg',
      CacheControl: AUDIO_CACHE_CONTROL,
      ContentMD5: Buffer.from(md5, 'hex').toString('base64')
    })
  );
  console.log(`${file}: ${there ? 'replaced' : 'uploaded'}. A deploy clears the CloudFront copy.`);
}
const seconds = (await parseFile(file, { duration: true })).format.duration;
console.log(`audioBytes: ${body.length}\naudioSeconds: ${Math.round(seconds * 1000) / 1000}`);
