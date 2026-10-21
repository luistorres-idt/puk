#!/usr/bin/env node

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The repository-level infra command loads non-secret deployment settings from .env.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    configure();
  } catch {
    // Never forward subprocess output, parser errors, paths, or secret-bearing values.
    console.error(
      'Staging secret configuration failed. Check inputs, AWS access, and secret metadata.',
    );
    process.exitCode = 1;
  }
}

function configure() {
  const accountId = process.env.AWS_ACCOUNT_ID?.trim();
  const region = process.env.AWS_REGION?.trim() || 'us-east-2';
  const secretId = process.env.STAGING_RUNTIME_SECRET_ID?.trim() || 'puk/staging/runtime';
  if (
    !accountId ||
    !/^\d{12}$/.test(accountId) ||
    !/^[a-z]{2}(?:-[a-z0-9]+)+-\d$/.test(region) ||
    process.argv.slice(2).some((arg) => arg !== '--overwrite')
  ) {
    throw new Error('Invalid staging configuration arguments.');
  }
  const missing = [];
  for (const name of [
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_TECHNICIANS_SPREADSHEET_ID',
    'GOOGLE_DRIVE_CLIENT_EMAIL',
    'GOOGLE_DRIVE_PRIVATE_KEY',
    'GOOGLE_DRIVE_SHARED_DRIVE_ID',
    'SEED_CLIENT_ADMIN_EMAIL',
  ]) {
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

  const identity = runAws(['sts', 'get-caller-identity', '--region', region, '--output', 'json']);
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
  const seedAdminCredentials = createSeedAdminCredentials(process.env);
  const seedTechnicianEmail = process.env.SEED_TECHNICIAN_EMAIL ?? 'technician@staging.invalid';
  const secret = JSON.stringify({
    GOOGLE_CLIENT_EMAIL: googleClientEmail,
    GOOGLE_PRIVATE_KEY: googlePrivateKey,
    GOOGLE_DRIVE_CLIENT_EMAIL: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    GOOGLE_DRIVE_PRIVATE_KEY: process.env.GOOGLE_DRIVE_PRIVATE_KEY,
    GOOGLE_DRIVE_SHARED_DRIVE_ID: process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID,
    GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
    GOOGLE_TECHNICIANS_SPREADSHEET_ID: process.env.GOOGLE_TECHNICIANS_SPREADSHEET_ID,
    JWT_ACCESS_PRIVATE_KEY: access.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    JWT_ACCESS_PUBLIC_KEY: access.publicKey.export({ format: 'pem', type: 'spki' }),
    JWT_REFRESH_PRIVATE_KEY: refresh.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    JWT_REFRESH_PUBLIC_KEY: refresh.publicKey.export({ format: 'pem', type: 'spki' }),
    SEED_ADMIN_EMAIL: seedAdminCredentials.adminEmail,
    SEED_ADMIN_PASSWORD: seedAdminCredentials.adminPassword,
    SEED_CLIENT_ADMIN_EMAIL: seedAdminCredentials.clientAdminEmail,
    SEED_CLIENT_ADMIN_PASSWORD: seedAdminCredentials.clientAdminPassword,
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
  const credentialsFile = process.env.STAGING_ADMIN_CREDENTIALS_FILE;
  if (credentialsFile) {
    if (existsSync(credentialsFile)) {
      throw new Error('Staging admin credentials file already exists.');
    }
    writeFileSync(
      credentialsFile,
      `${JSON.stringify(
        [
          { email: seedAdminCredentials.adminEmail, password: seedAdminCredentials.adminPassword },
          {
            email: seedAdminCredentials.clientAdminEmail,
            password: seedAdminCredentials.clientAdminPassword,
          },
        ],
        null,
        2,
      )}\n`,
      { flag: 'wx', mode: 0o600 },
    );
  }
  console.log('Staging runtime secret configured successfully. Secret values are not displayed.');
}

export function createSeedAdminCredentials(
  environment = process.env,
  randomPassword = () => randomBytes(24).toString('base64url'),
) {
  const adminEmail = (environment.SEED_ADMIN_EMAIL ?? 'admin@staging.invalid').trim().toLowerCase();
  const clientAdminEmail = (environment.SEED_CLIENT_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!clientAdminEmail) throw new Error('SEED_CLIENT_ADMIN_EMAIL is required.');
  if (adminEmail === clientAdminEmail) {
    throw new Error('The internal and client admin accounts must use different email addresses.');
  }

  const adminPassword = randomPassword();
  let clientAdminPassword = randomPassword();
  while (clientAdminPassword === adminPassword) clientAdminPassword = randomPassword();

  return { adminEmail, adminPassword, clientAdminEmail, clientAdminPassword };
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
