import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createSeedAdminCredentials } from './configure-staging-secrets.mjs';
import { seedUsers } from '../../prisma/seed.ts';

const script = fileURLToPath(new URL('./configure-staging-secrets.mjs', import.meta.url));
const mockAws = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const mode = process.env.MODE;
const leak = process.env.FIXTURE_MARKER;
if (args[0] === 'sts') {
  if (mode === 'identity-error') { console.error(leak); process.exit(1); }
  if (mode === 'identity-json') { console.log(leak); process.exit(0); }
  console.log(JSON.stringify({Account: mode === 'wrong-account' ? '000000000000' : '075566976700'}));
} else if (args[1] === 'describe-secret') {
  if (mode === 'exists') { console.log('{}'); process.exit(0); }
  if (mode === 'denied') { console.error('AccessDeniedException ' + leak); process.exit(1); }
  console.error('An error occurred (ResourceNotFoundException) when calling the DescribeSecret operation: ' + leak);
  process.exit(254);
} else if (['create-secret', 'put-secret-value'].includes(args[1])) {
  const path = args[args.indexOf('--secret-string') + 1].slice(7);
  fs.writeFileSync(process.env.CAPTURE, JSON.stringify({
    payload: JSON.parse(fs.readFileSync(path, 'utf8')),
    mode: fs.statSync(path).mode & 0o777,
    path,
  }));
  console.log(leak);
  console.error(leak);
  if (mode === 'write-error' || mode === 'race') process.exit(1);
} else {
  console.error('Forbidden mock AWS operation'); process.exit(99);
}
`;

function runFixture(
  t,
  {
    mode = 'missing',
    args = [],
    nativeEnvFile = false,
    malformedFile = false,
    missingInput = false,
    missingClientAdminEmail = false,
    noAws = false,
    region = 'us-east-2',
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'puk-secret-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const marker = randomBytes(24).toString('hex');
  const config = {
    GOOGLE_CLIENT_EMAIL: `${marker}@fixture.invalid`,
    GOOGLE_PRIVATE_KEY: `fixture-key-${marker}`,
    GOOGLE_SPREADSHEET_ID: `fixture-sheet-${marker}`,
    GOOGLE_TECHNICIANS_SPREADSHEET_ID: `fixture-technicians-${marker}`,
    SEED_CLIENT_ADMIN_EMAIL: 'client-admin@fixture.invalid',
  };
  const callsPath = join(directory, 'calls.jsonl');
  const capturePath = join(directory, 'capture.json');
  // No inherited environment: neither credentials nor real configuration can reach the child.
  const env = {
    PATH: directory,
    HOME: directory,
    TMPDIR: directory,
    AWS_REGION: region,
    MODE: mode,
    FIXTURE_MARKER: marker,
    CALLS: callsPath,
    CAPTURE: capturePath,
  };
  if (!noAws) writeFileSync(join(directory, 'aws'), mockAws, { mode: 0o700 });
  const nodeArgs = [];
  if (nativeEnvFile) {
    const envPath = join(directory, 'fixture.env');
    writeFileSync(
      envPath,
      Object.entries(config)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
      { mode: 0o600 },
    );
    nodeArgs.push(`--env-file=${envPath}`);
  } else {
    Object.assign(env, config);
  }
  if (malformedFile) {
    env.GOOGLE_SERVICE_ACCOUNT_FILE = join(directory, 'service-account.json');
    writeFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, `{${marker}`, { mode: 0o600 });
  }
  if (missingInput) delete env.GOOGLE_SPREADSHEET_ID;
  if (missingClientAdminEmail) delete env.SEED_CLIENT_ADMIN_EMAIL;
  const result = spawnSync(process.execPath, [...nodeArgs, script, ...args], {
    env,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.ok(!output.includes(marker), 'No fixture secret may appear in output');
  const calls = existsSync(callsPath)
    ? readFileSync(callsPath, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
  assert.ok(
    calls.every((call) => !call.some((arg) => /get-secret-value/.test(arg))),
    'Never read secret values',
  );
  const capture = existsSync(capturePath)
    ? JSON.parse(readFileSync(capturePath, 'utf8'))
    : undefined;
  if (capture) {
    for (const value of Object.values(capture.payload)) {
      assert.ok(!output.includes(value), 'No stored secret field may appear in output');
    }
    assert.equal(capture.mode, 0o600);
    assert.ok(!existsSync(capture.path), 'Temporary secret file must be removed');
    assert.ok(
      !calls.flat().some((arg) => arg.includes(marker)),
      'Secret values must not enter CLI arguments',
    );
  }
  return { result, calls, capture };
}

test('creates a missing runtime secret with generated JWT and random seed, using native --env-file', (t) => {
  const { result, calls, capture } = runFixture(t, { nativeEnvFile: true });
  const diagnostic = JSON.stringify({
    error: result.error?.code,
    signal: result.signal,
    stderr: result.stderr?.replaceAll('fixture-', '[redacted]-'),
    stdout: result.stdout?.replaceAll('fixture-', '[redacted]-'),
    status: result.status,
  });
  assert.equal(result.status, 0, diagnostic);
  assert.deepEqual(
    calls.map((call) => call[1]),
    ['get-caller-identity', 'describe-secret', 'create-secret'],
  );
  assert.ok(calls[2].includes('--name'));
  assert.equal(capture.payload.SEED_ADMIN_PASSWORD.length, 32);
  assert.equal(capture.payload.SEED_CLIENT_ADMIN_PASSWORD.length, 32);
  assert.ok(
    capture.payload.SEED_ADMIN_PASSWORD !== capture.payload.SEED_CLIENT_ADMIN_PASSWORD,
    'admin passwords must be distinct without printing their values',
  );
  assert.equal(capture.payload.SEED_CLIENT_ADMIN_EMAIL, 'client-admin@fixture.invalid');
  assert.equal(Object.keys(capture.payload).length, 13);
  assert.ok(capture.payload.JWT_ACCESS_PRIVATE_KEY.startsWith('-----BEGIN PRIVATE KEY-----'));
  assert.ok(capture.payload.JWT_REFRESH_PUBLIC_KEY.startsWith('-----BEGIN PUBLIC KEY-----'));
});

test('refuses existing secret by default without writing', (t) => {
  const { result, calls, capture } = runFixture(t, { mode: 'exists' });
  assert.equal(result.status, 1);
  assert.equal(calls.length, 2);
  assert.equal(capture, undefined);
});

test('only explicit --overwrite permits updating an existing secret', (t) => {
  const { result, calls } = runFixture(t, { mode: 'exists', args: ['--overwrite'] });
  assert.equal(result.status, 0);
  assert.equal(calls[2][1], 'put-secret-value');
  assert.ok(calls[2].includes('--secret-id'));
});

for (const mode of ['denied', 'identity-error', 'identity-json', 'wrong-account']) {
  test(`fails closed and redacts ${mode}`, (t) => {
    const { result, capture } = runFixture(t, { mode });
    assert.equal(result.status, 1);
    assert.equal(capture, undefined);
  });
}

for (const mode of ['write-error', 'race']) {
  test(`redacts ${mode}, cleans temporary file, and never falls back to overwrite`, (t) => {
    const { result, calls } = runFixture(t, { mode });
    assert.equal(result.status, 1);
    assert.equal(calls[2][1], 'create-secret');
    assert.equal(calls.length, 3);
  });
}

test('redacts malformed service-account JSON errors', (t) => {
  const { result, capture } = runFixture(t, { malformedFile: true });
  assert.equal(result.status, 1);
  assert.equal(capture, undefined);
});

test('generates distinct admin passwords and uses the configured client email', () => {
  const generated = ['fixture-password-one', 'fixture-password-one', 'fixture-password-two'];
  let index = 0;
  const credentials = createSeedAdminCredentials(
    { SEED_CLIENT_ADMIN_EMAIL: ' CLIENT-ADMIN@fixture.invalid ' },
    () => generated[index++],
  );

  assert.equal(credentials.adminEmail, 'admin@staging.invalid');
  assert.equal(credentials.clientAdminEmail, 'client-admin@fixture.invalid');
  assert.ok(
    credentials.adminPassword !== credentials.clientAdminPassword,
    'colliding generated passwords must be regenerated without exposing them',
  );
  assert.equal(index, 3);
});

for (const options of [
  { missingInput: true },
  { missingClientAdminEmail: true },
  { noAws: true },
  { args: ['--invalid'] },
  { region: 'us-west-2' },
]) {
  test(`rejects invalid configuration ${Object.keys(options)[0]}`, (t) => {
    const { result, capture } = runFixture(t, options);
    assert.equal(result.status, 1);
    assert.equal(capture, undefined);
  });
}

test('seeds two admin accounts with separate password hashes and no credential updates', async () => {
  const userUpserts = [];
  const hashedPasswords = [];
  let disconnected = false;
  await seedUsers(
    {
      DATABASE_URL: 'postgresql://fixture.invalid/db',
      NODE_ENV: 'production',
      SEED_ADMIN_EMAIL: 'internal-admin@fixture.invalid',
      SEED_ADMIN_PASSWORD: 'fixture-internal-password',
      SEED_CLIENT_ADMIN_EMAIL: 'client-admin@fixture.invalid',
      SEED_CLIENT_ADMIN_PASSWORD: 'fixture-client-password',
    },
    {
      createPrismaClient: () => ({
        technician: {
          upsert: async () => ({
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Fixture technician',
          }),
        },
        user: {
          upsert: async (args) => {
            userUpserts.push(args);
          },
        },
        $disconnect: async () => {
          disconnected = true;
        },
      }),
      hashPassword: async (password) => {
        hashedPasswords.push(password);
        return `hash-${hashedPasswords.length}`;
      },
    },
  );

  const admins = userUpserts.filter(({ create }) => create.role === 'ADMIN');
  assert.equal(admins.length, 2);
  assert.equal(admins[0].create.email, 'internal-admin@fixture.invalid');
  assert.equal(admins[1].create.email, 'client-admin@fixture.invalid');
  assert.ok(admins[0].create.passwordHash !== admins[1].create.passwordHash);
  assert.ok(hashedPasswords[0] !== hashedPasswords[1]);
  assert.ok(admins.every(({ update }) => Object.keys(update).length === 0));
  assert.ok(disconnected);
});

test('keeps the default internal admin email when local seed overrides are absent', async () => {
  const userUpserts = [];
  await seedUsers(
    { DATABASE_URL: 'postgresql://fixture.invalid/db', NODE_ENV: 'test' },
    {
      createPrismaClient: () => ({
        technician: {
          upsert: async () => ({
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Fixture technician',
          }),
        },
        user: { upsert: async (args) => userUpserts.push(args) },
        $disconnect: async () => {},
      }),
      hashPassword: async () => 'fixture-hash',
    },
  );

  const internalAdmin = userUpserts.find(({ create }) => create.role === 'ADMIN');
  assert.equal(internalAdmin?.create.email, 'admin@staging.invalid');
  assert.equal(userUpserts.filter(({ create }) => create.role === 'ADMIN').length, 1);
});
