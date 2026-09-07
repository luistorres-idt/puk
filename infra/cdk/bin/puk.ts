#!/usr/bin/env node

import { App } from 'aws-cdk-lib';

import { PukStagingApplicationStack } from '../lib/application-stack.js';
import { PukStagingFoundationStack } from '../lib/foundation-stack.js';

const app = new App();
const environment = { account: '075566976700', region: 'us-east-2' };

const foundation = new PukStagingFoundationStack(app, 'PukStagingFoundation', {
  env: environment,
});

new PukStagingApplicationStack(app, 'PukStagingApplication', {
  env: environment,
  foundation,
});
