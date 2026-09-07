import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, buildDatabaseUrl, parseEnvironment } from './environment.js';

const validEnvironment = {
  API_ORIGIN: 'http://localhost:3000',
  APP_ORIGIN: 'http://localhost:4173',
  CATALOG_CACHE_TTL_SECONDS: '60',
  CIRCUIT_BREAKER_ERROR_THRESHOLD: '50',
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: '30000',
  COOKIE_DOMAIN: '',
  COOKIE_SAME_SITE: 'lax',
  COOKIE_SECURE: 'false',
  DATABASE_URL: 'postgresql://puk:puk@localhost:5432/puk',
  DIRECT_URL: 'postgresql://puk:puk@localhost:5432/puk',
  GOOGLE_CLIENT_EMAIL: 'local-development@example.invalid',
  GOOGLE_CLIENTS_SHEET: 'Clientes',
  GOOGLE_EQUIPMENT_SHEET: 'SALIDAS',
  GOOGLE_PRIVATE_KEY: 'development-only',
  GOOGLE_SPREADSHEET_ID: 'development-only',
  JWT_ACCESS_PRIVATE_KEY: 'development-only',
  JWT_ACCESS_PUBLIC_KEY: 'development-only',
  JWT_ACCESS_TTL: '15m',
  JWT_AUDIENCE: 'puk-web',
  JWT_ISSUER: 'puk-api',
  JWT_REFRESH_PRIVATE_KEY: 'development-only',
  JWT_REFRESH_PUBLIC_KEY: 'development-only',
  JWT_REFRESH_TTL: '30d',
  LOG_LEVEL: 'debug',
  MAX_EVIDENCE_BYTES: '10485760',
  MAX_SIGNATURE_BYTES: '1048576',
  MIN_PASSWORD_LENGTH: '12',
  NODE_ENV: 'development',
  OUTBOX_POLL_INTERVAL_MS: '5000',
  PORT: '3000',
  PRESIGNED_URL_TTL_SECONDS: '300',
  S3_ACCESS_KEY_ID: 'development-only',
  S3_BUCKET: 'service-orders',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_FORCE_PATH_STYLE: 'true',
  S3_REGION: 'us-east-1',
  S3_SECRET_ACCESS_KEY: 'development-only',
  SHEETS_RETRY_LIMIT: '3',
  SHEETS_TIMEOUT_MS: '5000',
  TRUST_PROXY: 'false',
} as const;

describe('parseEnvironment', () => {
  it('parses and normalizes valid configuration', () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment.PORT).toBe(3000);
    expect(environment.COOKIE_DOMAIN).toBeUndefined();
    expect(environment.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('reports invalid field names without exposing their values', () => {
    const invalidEnvironment = {
      ...validEnvironment,
      GOOGLE_PRIVATE_KEY: '',
      PORT: 'not-a-port',
    };

    expect(() => parseEnvironment(invalidEnvironment)).toThrowError(
      new EnvironmentValidationError(['GOOGLE_PRIVATE_KEY', 'PORT']),
    );
  });

  it('builds the database URL from ECS/RDS secret fields', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      PUK_DATABASE_HOST: 'database.internal',
      PUK_DATABASE_NAME: 'puk',
      PUK_DATABASE_PASSWORD: 'secret with spaces',
      PUK_DATABASE_PORT: '5432',
      PUK_DATABASE_USER: 'puk',
    });

    expect(environment.DATABASE_URL).toBe(
      'postgresql://puk:secret%20with%20spaces@database.internal:5432/puk?schema=public',
    );
    expect(environment.DIRECT_URL).toBe(environment.DATABASE_URL);
  });

  it('builds the database URL with sslmode when PUK_DATABASE_SSL_MODE is set', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      PUK_DATABASE_HOST: 'database.internal',
      PUK_DATABASE_NAME: 'puk',
      PUK_DATABASE_PASSWORD: 'secret with spaces',
      PUK_DATABASE_PORT: '5432',
      PUK_DATABASE_SSL_MODE: 'no-verify',
      PUK_DATABASE_USER: 'puk',
    });

    expect(environment.DATABASE_URL).toBe(
      'postgresql://puk:secret%20with%20spaces@database.internal:5432/puk?schema=public&sslmode=no-verify',
    );
    expect(environment.DIRECT_URL).toBe(environment.DATABASE_URL);
  });

  it('allows omitting S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and COOKIE_DOMAIN for IAM role authentication in ECS', () => {
    const envWithoutKeys: Record<string, string | undefined> = { ...validEnvironment };
    delete envWithoutKeys.COOKIE_DOMAIN;
    delete envWithoutKeys.S3_ACCESS_KEY_ID;
    delete envWithoutKeys.S3_SECRET_ACCESS_KEY;

    const environment = parseEnvironment(envWithoutKeys);

    expect(environment.S3_ACCESS_KEY_ID).toBeUndefined();
    expect(environment.S3_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environment.COOKIE_DOMAIN).toBeUndefined();
  });

  it('normalizes empty and whitespace-only optional strings to undefined', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      COOKIE_DOMAIN: '   ',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '  ',
    });

    expect(environment.COOKIE_DOMAIN).toBeUndefined();
    expect(environment.S3_ACCESS_KEY_ID).toBeUndefined();
    expect(environment.S3_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it('defaults to sslmode=no-verify when connecting to an AWS RDS host without explicit sslMode', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      PUK_DATABASE_HOST: 'pukstagingfoundation-database.cxm0k6co4897.us-east-2.rds.amazonaws.com',
      PUK_DATABASE_NAME: 'puk',
      PUK_DATABASE_PASSWORD: 'secretpassword',
      PUK_DATABASE_PORT: '5432',
      PUK_DATABASE_SSL_MODE: undefined,
      PUK_DATABASE_USER: 'puk',
    });

    expect(environment.DATABASE_URL).toBe(
      'postgresql://puk:secretpassword@pukstagingfoundation-database.cxm0k6co4897.us-east-2.rds.amazonaws.com:5432/puk?schema=public&sslmode=no-verify',
    );
    expect(environment.DIRECT_URL).toBe(environment.DATABASE_URL);
  });

  it('respects explicit PUK_DATABASE_SSL_MODE even on AWS RDS host', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      PUK_DATABASE_HOST: 'pukstagingfoundation-database.cxm0k6co4897.us-east-2.rds.amazonaws.com',
      PUK_DATABASE_NAME: 'puk',
      PUK_DATABASE_PASSWORD: 'secretpassword',
      PUK_DATABASE_PORT: '5432',
      PUK_DATABASE_SSL_MODE: 'require',
      PUK_DATABASE_USER: 'puk',
    });

    expect(environment.DATABASE_URL).toBe(
      'postgresql://puk:secretpassword@pukstagingfoundation-database.cxm0k6co4897.us-east-2.rds.amazonaws.com:5432/puk?schema=public&sslmode=require',
    );
    expect(environment.DIRECT_URL).toBe(environment.DATABASE_URL);
  });
});

describe('buildDatabaseUrl', () => {
  it('returns undefined when any required parameter is missing or empty', () => {
    expect(
      buildDatabaseUrl({
        database: 'puk',
        host: undefined,
        password: 'pass',
        port: '5432',
        user: 'puk',
      }),
    ).toBeUndefined();

    expect(
      buildDatabaseUrl({
        database: '',
        host: 'localhost',
        password: 'pass',
        port: '5432',
        user: 'puk',
      }),
    ).toBeUndefined();
  });

  it('defaults sslmode to no-verify for AWS RDS endpoints when sslMode is not set', () => {
    const url = buildDatabaseUrl({
      database: 'puk',
      host: 'pukstagingfoundation-databaseb269d8bb.cxm0k6co4897.us-east-2.rds.amazonaws.com',
      password: 'secret password',
      port: '5432',
      user: 'puk',
    });

    expect(url).toBe(
      'postgresql://puk:secret%20password@pukstagingfoundation-databaseb269d8bb.cxm0k6co4897.us-east-2.rds.amazonaws.com:5432/puk?schema=public&sslmode=no-verify',
    );
  });

  it('preserves explicit sslMode for AWS RDS endpoints', () => {
    const url = buildDatabaseUrl({
      database: 'puk',
      host: 'pukstagingfoundation-databaseb269d8bb.cxm0k6co4897.us-east-2.rds.amazonaws.com',
      password: 'pass',
      port: '5432',
      sslMode: 'require',
      user: 'puk',
    });

    expect(url).toBe(
      'postgresql://puk:pass@pukstagingfoundation-databaseb269d8bb.cxm0k6co4897.us-east-2.rds.amazonaws.com:5432/puk?schema=public&sslmode=require',
    );
  });

  it('does not include sslmode for non-RDS endpoints when sslMode is not set', () => {
    const url = buildDatabaseUrl({
      database: 'puk',
      host: 'database.internal',
      password: 'pass',
      port: '5432',
      user: 'puk',
    });

    expect(url).toBe('postgresql://puk:pass@database.internal:5432/puk?schema=public');
  });

  it('includes sslmode for non-RDS endpoints when explicitly specified', () => {
    const url = buildDatabaseUrl({
      database: 'puk',
      host: 'database.internal',
      password: 'pass',
      port: '5432',
      sslMode: 'prefer',
      user: 'puk',
    });

    expect(url).toBe(
      'postgresql://puk:pass@database.internal:5432/puk?schema=public&sslmode=prefer',
    );
  });
});
