#!/usr/bin/env node

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const accountId = '075566976700';
const region = process.env.AWS_REGION ?? 'us-east-2';
const secretId = 'puk/staging/runtime';
const missing = process.env.GOOGLE_SPREADSHEET_ID ? [] : ['GOOGLE_SPREADSHEET_ID'];
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
  console.error(`Expected AWS account ${accountId}, but the active account is ${caller.Account}.`);
  process.exit(1);
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
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(24).toString('base64url');
const seedTechnicianEmail = process.env.SEED_TECHNICIAN_EMAIL ?? 'technician@staging.invalid';
const secret = JSON.stringify({
  GOOGLE_CLIENT_EMAIL: googleClientEmail,
  GOOGLE_PRIVATE_KEY: googlePrivateKey,
  GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
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
    'put-secret-value',
    '--region',
    region,
    '--secret-id',
    secretId,
    '--secret-string',
    `file://${temporarySecretFile}`,
  ]);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
console.log(`Configured ${secretId} in ${accountId}/${region}.`);
console.log(`Initial staging admin: ${seedAdminEmail}`);
console.log(`Initial staging password: ${seedAdminPassword}`);
console.log('Store this password now; it is not written to the repository.');

function runAws(args) {
  const result = spawnSync('aws', args, { encoding: 'utf8' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr.trim());
    process.exit(result.status ?? 1);
  }
  return result;
}
