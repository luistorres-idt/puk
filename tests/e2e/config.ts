/**
 * E2E Test Suite Configuration
 *
 * Resolves endpoints from environment variables, CLI arguments, or mock server.
 * Authoritative interface contracts are documented in docs/technical/.
 */

export interface E2EConfig {
  /** CloudFront HTTPS distribution endpoint (e.g. https://d123456.cloudfront.net) */
  cloudfrontUrl: string;
  /** CloudFront HTTP endpoint for testing HTTP to HTTPS redirection */
  cloudfrontHttpUrl: string;
  /** ALB origin endpoint (e.g. http://puk-st-loadb-xxx.us-east-2.elb.amazonaws.com) */
  albUrl: string;
  /** Shared secret for X-Origin-Verify header between CloudFront and ALB */
  originVerifySecret: string;
  /** AWS Region for cloud infrastructure checks */
  awsRegion: string;
  /** CloudFormation application stack name */
  applicationStackName: string;
  /** ECS Cluster name */
  ecsClusterName: string;
  /** Whether the tests are running against the local mock simulator */
  isMock: boolean;
  /** Whether to skip direct AWS API checks */
  skipAwsChecks: boolean;
}

const DEFAULT_ORIGIN_VERIFY_SECRET = 'puk-staging-075566976700-us-east-2-origin-verify';
const DEFAULT_AWS_REGION = 'us-east-2';
const DEFAULT_APP_STACK = 'PukStagingApplication';
const DEFAULT_ECS_CLUSTER = 'puk-staging';

export function resolveConfig(overrides: Partial<E2EConfig> = {}): E2EConfig {
  const isMockFlag =
    process.argv.includes('--mock') ||
    process.env['MOCK_E2E'] === 'true' ||
    process.env['MOCK_E2E'] === '1';

  const defaultCloudfront = process.env['CLOUDFRONT_URL'] ?? 'http://127.0.0.1:8443';
  let defaultCloudfrontHttp = process.env['CLOUDFRONT_HTTP_URL'];
  if (!defaultCloudfrontHttp) {
    try {
      const u = new URL(defaultCloudfront);
      u.protocol = 'http:';
      if (u.port === '8443') {
        u.port = '8080';
      }
      defaultCloudfrontHttp = u.toString().replace(/\/$/, '');
    } catch {
      defaultCloudfrontHttp = 'http://127.0.0.1:8080';
    }
  }

  const defaultAlb = process.env['ALB_URL'] ?? 'http://127.0.0.1:8000';
  const originVerifySecret =
    process.env['ORIGIN_VERIFY_SECRET'] ??
    process.env['X_ORIGIN_VERIFY'] ??
    DEFAULT_ORIGIN_VERIFY_SECRET;

  const skipAwsChecks =
    process.env['SKIP_AWS_CHECKS'] === 'true' ||
    process.env['SKIP_AWS_CHECKS'] === '1' ||
    isMockFlag ||
    (!process.env['AWS_REGION'] && !process.env['AWS_DEFAULT_REGION']);

  return {
    cloudfrontUrl: overrides.cloudfrontUrl ?? defaultCloudfront.replace(/\/$/, ''),
    cloudfrontHttpUrl: overrides.cloudfrontHttpUrl ?? defaultCloudfrontHttp.replace(/\/$/, ''),
    albUrl: overrides.albUrl ?? defaultAlb.replace(/\/$/, ''),
    originVerifySecret: overrides.originVerifySecret ?? originVerifySecret,
    awsRegion: overrides.awsRegion ?? process.env['AWS_REGION'] ?? DEFAULT_AWS_REGION,
    applicationStackName:
      overrides.applicationStackName ?? process.env['APP_STACK_NAME'] ?? DEFAULT_APP_STACK,
    ecsClusterName:
      overrides.ecsClusterName ?? process.env['ECS_CLUSTER_NAME'] ?? DEFAULT_ECS_CLUSTER,
    isMock: overrides.isMock ?? isMockFlag,
    skipAwsChecks: overrides.skipAwsChecks ?? skipAwsChecks,
  };
}
