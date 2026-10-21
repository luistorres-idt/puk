#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = resolve(repositoryRoot, '.env');
const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error('Usage: with-staging-env <command> [args...]');
  process.exit(2);
}

const env = { ...process.env };
if (existsSync(envPath)) {
  const localConfig = dotenv.parse(readFileSync(envPath));
  for (const key of [
    'AWS_ACCOUNT_ID',
    'AWS_REGION',
    'STAGING_RUNTIME_SECRET_ID',
    'AWS_DEPLOY_ROLE_NAME',
  ]) {
    if (env[key] === undefined && localConfig[key] !== undefined) {
      env[key] = localConfig[key];
    }
  }
}

const result = spawnSync(command, args, {
  cwd: repositoryRoot,
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Could not start the requested staging command.');
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
