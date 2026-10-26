// The CloudFormation templates for another.thingelstad.com on S3 and CloudFront, written to
// infra/generated/ by `npm run infra:generate`. Three stacks, each deployed from this Mac as the
// cloud-engineer identity (`npm run infra -- <stack>`), never from CI:
//
//   certificate  the another.thingelstad.com certificate, validated by a CNAME at Namecheap
//   site         the site and audio buckets, the distribution, its function and redirect store,
//                headers, 5xx alarm
//   delivery     the role GitHub Actions assumes to publish a build (scripts/deploy-aws.mjs)
//
// The episode audio is not in the build. It lives in its own bucket, written once per episode by WT
// Builder's send (or scripts/put-audio.mjs), and the distribution serves it at the same
// /uploads/YYYY/another-thing-N.mp3 URLs every subscriber's client holds.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viewerRequestCode } from './viewer-request.mjs';

export const DOMAIN = 'another.thingelstad.com';
// The audio's path on the site; every key in the audio bucket is the URL path without its slash.
export const AUDIO_PATH = '/uploads/*.mp3';
const ref = (name) => ({ Ref: name });
const sub = (value) => ({ 'Fn::Sub': value });
const get = (name, field) => ({ 'Fn::GetAtt': [name, field] });
const custom = (a, b) => ({ 'Fn::If': ['CustomDomain', a, b] });
// The Thingelstad family alarm topic, subscribed to the shared projects-ops-alerts queue.
const alarmTopic = sub('arn:${AWS::Partition}:sns:us-east-1:${AWS::AccountId}:weekly-thing-librarian-alarms');
// AWS managed CachingOptimized: no cookies, headers or query strings in the key, so ?ref= variants share
// one cached copy; it honours the Cache-Control each object is uploaded with.
const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';

const template = (Description, Resources, Outputs, extra = {}) => ({
  AWSTemplateFormatVersion: '2010-09-09',
  Description,
  ...extra,
  Resources,
  Outputs
});
const output = (Value) => ({ Value });

const privateBucket = (noncurrentDays) => ({
  Type: 'AWS::S3::Bucket',
  DeletionPolicy: 'Retain',
  UpdateReplacePolicy: 'Retain',
  Properties: {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true
    },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }]
    },
    OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
    VersioningConfiguration: { Status: 'Enabled' },
    LifecycleConfiguration: {
      Rules: [{ Id: 'old-versions', Status: 'Enabled', NoncurrentVersionExpiration: { NoncurrentDays: noncurrentDays } }]
    }
  }
});

// Only this distribution reads the bucket.
const distributionReads = (bucket) => ({
  Type: 'AWS::S3::BucketPolicy',
  Properties: {
    Bucket: ref(bucket),
    PolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'cloudfront.amazonaws.com' },
          Action: 's3:GetObject',
          Resource: sub(`\${${bucket}.Arn}/*`),
          Condition: {
            StringEquals: {
              'AWS:SourceArn': sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}')
            }
          }
        }
      ]
    }
  }
});

export const certificate = template(
  `${DOMAIN} HTTPS certificate - external DNS validation`,
  {
    Certificate: {
      Type: 'AWS::CertificateManager::Certificate',
      Properties: { DomainName: DOMAIN, ValidationMethod: 'DNS' }
    }
  },
  { CertificateArn: output(ref('Certificate')) }
);

export const site = template(
  `${DOMAIN} static site and episode audio - Another Thing`,
  {
    // The build: each deploy writes it and removes what the build no longer writes. Versioned, so an
    // object a deploy deletes or overwrites can be restored.
    SiteBucket: privateBucket(90),
    SitePolicy: distributionReads('SiteBucket'),
    // The episode audio: written by the send, never by a deploy, and nothing deletes from it. A
    // replaced master keeps its old version for a year.
    AudioBucket: privateBucket(365),
    AudioPolicy: distributionReads('AudioBucket'),
    OriginAccess: {
      Type: 'AWS::CloudFront::OriginAccessControl',
      Properties: {
        OriginAccessControlConfig: {
          Name: sub('${AWS::StackName}-s3'),
          OriginAccessControlOriginType: 's3',
          SigningBehavior: 'always',
          SigningProtocol: 'sigv4'
        }
      }
    },
    // Filled by each deploy from the build's _redirects.json; see viewer-request.mjs.
    Redirects: {
      Type: 'AWS::CloudFront::KeyValueStore',
      Properties: {
        Name: sub('${AWS::StackName}-redirects'),
        Comment: 'Redirect paths to their targets, written by each deploy from the build'
      }
    },
    ViewerRequest: {
      Type: 'AWS::CloudFront::Function',
      Properties: {
        Name: sub('${AWS::StackName}-viewer-request'),
        AutoPublish: true,
        FunctionConfig: {
          Comment: 'Redirects as 301s, the slash form, and index.html for directory URLs',
          Runtime: 'cloudfront-js-2.0',
          KeyValueStoreAssociations: [{ KeyValueStoreARN: get('Redirects', 'Arn') }]
        },
        FunctionCode: viewerRequestCode
      }
    },
    // GitHub Pages answered every file with Access-Control-Allow-Origin: *, so this keeps that for the
    // feeds, the JSON and the audio a web player may fetch from another site, and adds the security
    // headers.
    Headers: {
      Type: 'AWS::CloudFront::ResponseHeadersPolicy',
      Properties: {
        ResponseHeadersPolicyConfig: {
          Name: sub('${AWS::StackName}-headers'),
          CorsConfig: {
            AccessControlAllowCredentials: false,
            AccessControlAllowHeaders: { Items: ['*'] },
            AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
            AccessControlAllowOrigins: { Items: ['*'] },
            AccessControlExposeHeaders: { Items: ['Content-Length', 'Content-Range', 'Accept-Ranges'] },
            OriginOverride: true
          },
          SecurityHeadersConfig: {
            ContentTypeOptions: { Override: true },
            FrameOptions: { FrameOption: 'SAMEORIGIN', Override: true },
            ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
            StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, Override: true }
          }
        }
      }
    },
    Distribution: {
      Type: 'AWS::CloudFront::Distribution',
      Properties: {
        DistributionConfig: {
          Enabled: true,
          Comment: `${DOMAIN} - Another Thing`,
          PriceClass: 'PriceClass_100',
          IPV6Enabled: true,
          HttpVersion: 'http2and3',
          DefaultRootObject: 'index.html',
          Aliases: custom([DOMAIN], ref('AWS::NoValue')),
          ViewerCertificate: custom(
            { AcmCertificateArn: ref('CertificateArn'), SslSupportMethod: 'sni-only', MinimumProtocolVersion: 'TLSv1.2_2021' },
            { CloudFrontDefaultCertificate: true }
          ),
          Origins: [
            {
              Id: 'site',
              DomainName: get('SiteBucket', 'RegionalDomainName'),
              OriginAccessControlId: ref('OriginAccess'),
              S3OriginConfig: { OriginAccessIdentity: '' }
            },
            {
              Id: 'audio',
              DomainName: get('AudioBucket', 'RegionalDomainName'),
              OriginAccessControlId: ref('OriginAccess'),
              S3OriginConfig: { OriginAccessIdentity: '' }
            }
          ],
          // Podcast clients ask for byte ranges; CloudFront and S3 answer them as they come. No function:
          // an .mp3 path is a file, and nothing is compressed.
          CacheBehaviors: [
            {
              PathPattern: AUDIO_PATH,
              TargetOriginId: 'audio',
              ViewerProtocolPolicy: 'redirect-to-https',
              AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
              CachedMethods: ['GET', 'HEAD'],
              Compress: false,
              CachePolicyId: CACHING_OPTIMIZED,
              ResponseHeadersPolicyId: ref('Headers')
            }
          ],
          DefaultCacheBehavior: {
            TargetOriginId: 'site',
            ViewerProtocolPolicy: 'redirect-to-https',
            AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
            CachedMethods: ['GET', 'HEAD'],
            Compress: true,
            CachePolicyId: CACHING_OPTIMIZED,
            ResponseHeadersPolicyId: ref('Headers'),
            FunctionAssociations: [{ EventType: 'viewer-request', FunctionARN: get('ViewerRequest', 'FunctionARN') }]
          },
          // A missing object is a 403 from S3 behind OAC (no ListBucket). Both become the site's 404 page.
          CustomErrorResponses: [
            { ErrorCode: 403, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 60 },
            { ErrorCode: 404, ResponseCode: 404, ResponsePagePath: '/404.html', ErrorCachingMinTTL: 60 }
          ]
        }
      }
    },
    DistributionErrorAlarm: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmName: sub('${AWS::StackName}-distribution-5xx'),
        AlarmDescription: `CloudFront returned more than 5% 5xx responses for ${DOMAIN} in two of three five-minute windows.`,
        Namespace: 'AWS/CloudFront',
        MetricName: '5xxErrorRate',
        Dimensions: [
          { Name: 'DistributionId', Value: ref('Distribution') },
          { Name: 'Region', Value: 'Global' }
        ],
        Statistic: 'Average',
        Period: 300,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 2,
        Threshold: 5,
        ComparisonOperator: 'GreaterThanThreshold',
        TreatMissingData: 'notBreaching',
        AlarmActions: [alarmTopic]
      }
    }
  },
  {
    SiteBucket: output(ref('SiteBucket')),
    AudioBucket: output(ref('AudioBucket')),
    DistributionId: output(ref('Distribution')),
    CloudFrontDomain: output(get('Distribution', 'DomainName')),
    RedirectStoreArn: output(get('Redirects', 'Arn'))
  },
  {
    Parameters: { CertificateArn: { Type: 'String', Default: '' } },
    Conditions: { CustomDomain: { 'Fn::Not': [{ 'Fn::Equals': [ref('CertificateArn'), ''] }] } }
  }
);

// Application delivery only: publish a build into the site bucket, refresh the redirect store, clear the
// cache. It reads the audio bucket, to check every enclosure is there, and cannot write it.
// Infrastructure changes stay a separate, local deployment.
export const delivery = template(
  `${DOMAIN} GitHub application delivery`,
  {
    DeploymentRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Federated: sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:oidc-provider/token.actions.githubusercontent.com')
              },
              Action: 'sts:AssumeRoleWithWebIdentity',
              Condition: {
                StringEquals: {
                  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                  // GitHub's immutable subject (owner and repository ids) and the named form, main only.
                  'token.actions.githubusercontent.com:sub': [
                    'repo:jthingelstad@5351/another.thingelstad.com@1206438563:ref:refs/heads/main',
                    'repo:jthingelstad/another.thingelstad.com:ref:refs/heads/main'
                  ]
                }
              }
            }
          ]
        },
        Policies: [
          {
            PolicyName: 'ApplicationDelivery',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: ['s3:ListBucket', 's3:GetBucketLocation'],
                  Resource: [
                    sub('arn:${AWS::Partition}:s3:::${SiteBucket}'),
                    sub('arn:${AWS::Partition}:s3:::${AudioBucket}')
                  ]
                },
                {
                  // Delete removes pages the build no longer writes; the bucket keeps 90 days of versions.
                  Effect: 'Allow',
                  Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
                  Resource: sub('arn:${AWS::Partition}:s3:::${SiteBucket}/*')
                },
                {
                  // Read-only: the deploy refuses to publish a feed whose enclosures are not all there.
                  Effect: 'Allow',
                  Action: 's3:GetObject',
                  Resource: sub('arn:${AWS::Partition}:s3:::${AudioBucket}/*')
                },
                {
                  Effect: 'Allow',
                  Action: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation', 'cloudfront:GetDistribution'],
                  Resource: sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${DistributionId}')
                },
                {
                  Effect: 'Allow',
                  Action: [
                    'cloudfront-keyvaluestore:DescribeKeyValueStore',
                    'cloudfront-keyvaluestore:ListKeys',
                    'cloudfront-keyvaluestore:UpdateKeys'
                  ],
                  Resource: ref('RedirectStoreArn')
                },
                {
                  // Read-only: the deploy refuses to publish unless the live template matches the generated one.
                  Effect: 'Allow',
                  Action: ['cloudformation:DescribeStacks', 'cloudformation:GetTemplate'],
                  Resource: sub('arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${SiteStack}/*')
                }
              ]
            }
          }
        ]
      }
    }
  },
  { DeploymentRoleArn: output(get('DeploymentRole', 'Arn')) },
  {
    Parameters: {
      SiteStack: { Type: 'String' },
      SiteBucket: { Type: 'String' },
      AudioBucket: { Type: 'String' },
      DistributionId: { Type: 'String' },
      RedirectStoreArn: { Type: 'String' }
    }
  }
);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), 'generated');
  mkdirSync(out, { recursive: true });
  for (const [name, body] of Object.entries({ certificate, site, delivery }))
    writeFileSync(join(out, `${name}.json`), JSON.stringify(body, null, 2) + '\n');
}
