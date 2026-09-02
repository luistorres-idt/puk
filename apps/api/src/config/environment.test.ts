import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, parseEnvironment } from './environment.js';

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
});
