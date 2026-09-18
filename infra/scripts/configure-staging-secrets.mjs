#!/usr/bin/env node

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const accountId = '075566976700';
const region = process.env.AWS_REGION ?? 'us-east-2';
const secretId = 'puk/staging/runtime';
// Load environment files externally with Node's native --env-file option.
try {
  configure();
} catch {
  // Never forward subprocess output, parser errors, paths, or secret-bearing values.
  console.error(
    'Staging secret configuration failed. Check inputs, AWS access, and secret metadata.',
  );
  process.exitCode = 1;
}

function configure() {
  if (region !== 'us-east-2' || process.argv.slice(2).some((arg) => arg !== '--overwrite')) {
    throw new Error('Invalid staging configuration arguments.');
  }
  const missing = [];
  for (const name of ['GOOGLE_SPREADSHEET_ID', 'GOOGLE_TECHNICIANS_SPREADSHEET_ID']) {
    if (!process.env[name]) missing.push(name);
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_FILE && !process.env.GOOGLE_PRIVATE_KEY) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_PRIVATE_KEY');
  }
  if (missing.length > 0) {
    console.error(`Missing configuration: ${missing.join(', ')}`);
    console.error(
      'Set the Google service account values in the environment; GOOGLE_SERVICE_ACCOUNT_FILE may point to the downloaded JSON key.',
    );
    process.exit(1);
  }

  const identity = runAws(['sts', 'get-caller-identity', '--output', 'json']);
  const caller = JSON.parse(identity.stdout);
  if (caller.Account !== accountId) {
    console.error('The active AWS account is not the staging account.');
    process.exit(1);
  }

  const existing = runAws(
    ['secretsmanager', 'describe-secret', '--region', region, '--secret-id', secretId],
    true,
  );
  const exists = existing.status === 0;
  if (
    !exists &&
    !/An error occurred \(ResourceNotFoundException\) when calling the DescribeSecret operation/.test(
      existing.stderr ?? '',
    )
  ) {
    throw new Error('Secret metadata lookup failed.');
  }
  if (exists && !process.argv.slice(2).includes('--overwrite')) {
    console.error(
      'Runtime secret already exists. Refusing overwrite; use --overwrite to explicitly rotate its contents.',
    );
    process.exitCode = 1;
    return;
  }

  const access = generateKeyPairSync('ed25519');
  const refresh = generateKeyPairSync('ed25519');
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8'))
    : undefined;
  const googleClientEmail = process.env.GOOGLE_CLIENT_EMAIL ?? serviceAccount?.client_email;
  const googlePrivateKey = process.env.GOOGLE_PRIVATE_KEY ?? serviceAccount?.private_key;
  if (!googleClientEmail || !googlePrivateKey) {
    console.error('The Google service account email or private key is missing.');
    process.exit(1);
  }
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@staging.invalid';
  const seedAdminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? randomBytes(24).toString('base64url');
  const seedTechnicianEmail = process.env.SEED_TECHNICIAN_EMAIL ?? 'technician@staging.invalid';
  const secret = JSON.stringify({
    GOOGLE_CLIENT_EMAIL: googleClientEmail,
    GOOGLE_PRIVATE_KEY: googlePrivateKey,
    GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
    GOOGLE_TECHNICIANS_SPREADSHEET_ID: process.env.GOOGLE_TECHNICIANS_SPREADSHEET_ID,
    JWT_ACCESS_PRIVATE_KEY: access.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    JWT_ACCESS_PUBLIC_KEY: access.publicKey.export({ format: 'pem', type: 'spki' }),
    JWT_REFRESH_PRIVATE_KEY: refresh.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    JWT_REFRESH_PUBLIC_KEY: refresh.publicKey.export({ format: 'pem', type: 'spki' }),
    SEED_ADMIN_EMAIL: seedAdminEmail,
    SEED_ADMIN_PASSWORD: seedAdminPassword,
    SEED_TECHNICIAN_EMAIL: seedTechnicianEmail,
  });

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'puk-staging-secret-'));
  const temporarySecretFile = join(temporaryDirectory, 'runtime.json');
  try {
    writeFileSync(temporarySecretFile, secret, { mode: 0o600 });
    runAws([
      'secretsmanager',
      exists ? 'put-secret-value' : 'create-secret',
      '--region',
      region,
      exists ? '--secret-id' : '--name',
      secretId,
      '--secret-string',
      `file://${temporarySecretFile}`,
    ]);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
  console.log('Staging runtime secret configured successfully. Secret values are not displayed.');
}

function runAws(args, allowFailure = false) {
  const result = spawnSync('aws', args, {
    encoding: 'utf8',
    env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' },
  });
  if (result.error || (result.status !== 0 && !allowFailure)) {
    throw new Error('AWS operation failed.');
  }
  return result;
}
