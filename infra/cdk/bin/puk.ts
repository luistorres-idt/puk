#!/usr/bin/env node

import { App } from 'aws-cdk-lib';

import { PukStagingApplicationStack } from '../lib/application-stack.js';
import { PukStagingFoundationStack } from '../lib/foundation-stack.js';

const app = new App();
const account = process.env['AWS_ACCOUNT_ID']?.trim();
const region = process.env['AWS_REGION']?.trim();
if (!account || !/^\d{12}$/.test(account)) {
  throw new Error('Set AWS_ACCOUNT_ID to the 12-digit target AWS account ID.');
}
if (!region || !/^[a-z]{2}(?:-[a-z0-9]+)+-\d$/.test(region)) {
  throw new Error('Set AWS_REGION to a valid AWS region.');
}

const environment = { account, region };
const runtimeSecretId = process.env['STAGING_RUNTIME_SECRET_ID']?.trim() || 'puk/staging/runtime';
const githubDeployRoleName =
  process.env['GITHUB_DEPLOY_ROLE_NAME']?.trim() || 'puk-staging-github-deploy';

const foundation = new PukStagingFoundationStack(app, 'PukStagingFoundation', {
  env: environment,
  githubDeployRoleName,
  runtimeSecretId,
});

new PukStagingApplicationStack(app, 'PukStagingApplication', {
  env: environment,
  foundation,
});
