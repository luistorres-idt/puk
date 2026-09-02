import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import * as v from 'valibot';

loadDotenv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

const integerFromString = (minimum: number, maximum: number) =>
  v.pipe(
    v.string(),
    v.regex(/^\d+$/),
    v.transform(Number),
    v.integer(),
    v.minValue(minimum),
    v.maxValue(maximum),
  );

const booleanFromString = v.pipe(
  v.picklist(['true', 'false']),
  v.transform((value) => value === 'true'),
);

const optionalString = v.pipe(
  v.string(),
  v.transform((value) => (value.length === 0 ? undefined : value)),
);

export const EnvironmentSchema = v.object({
  API_ORIGIN: v.pipe(v.string(), v.url()),
  APP_ORIGIN: v.pipe(v.string(), v.url()),
  CATALOG_CACHE_TTL_SECONDS: integerFromString(1, 86_400),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: integerFromString(1, 100),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: integerFromString(100, 300_000),
  COOKIE_DOMAIN: optionalString,
  COOKIE_SAME_SITE: v.picklist(['strict', 'lax', 'none']),
  COOKIE_SECURE: booleanFromString,
  DATABASE_URL: v.pipe(v.string(), v.nonEmpty()),
  DIRECT_URL: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_CLIENT_EMAIL: v.pipe(v.string(), v.email()),
  GOOGLE_CLIENTS_SHEET: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_EQUIPMENT_SHEET: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_PRIVATE_KEY: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_SPREADSHEET_ID: v.pipe(v.string(), v.nonEmpty()),
  JWT_ACCESS_PRIVATE_KEY: v.pipe(v.string(), v.nonEmpty()),
  JWT_ACCESS_PUBLIC_KEY: v.pipe(v.string(), v.nonEmpty()),
  JWT_ACCESS_TTL: v.pipe(v.string(), v.nonEmpty()),
  JWT_AUDIENCE: v.pipe(v.string(), v.nonEmpty()),
  JWT_ISSUER: v.pipe(v.string(), v.nonEmpty()),
  JWT_REFRESH_PRIVATE_KEY: v.pipe(v.string(), v.nonEmpty()),
  JWT_REFRESH_PUBLIC_KEY: v.pipe(v.string(), v.nonEmpty()),
  JWT_REFRESH_TTL: v.pipe(v.string(), v.nonEmpty()),
  LOG_LEVEL: v.picklist(['debug', 'info', 'warn', 'error']),
  MAX_EVIDENCE_BYTES: integerFromString(1, 100 * 1024 * 1024),
  MAX_SIGNATURE_BYTES: integerFromString(1, 10 * 1024 * 1024),
  MIN_PASSWORD_LENGTH: v.fallback(integerFromString(8, 128), 12),
  NODE_ENV: v.picklist(['development', 'test', 'production']),
  OUTBOX_POLL_INTERVAL_MS: integerFromString(100, 300_000),
  PORT: integerFromString(1, 65_535),
  PRESIGNED_URL_TTL_SECONDS: integerFromString(30, 3_600),
  S3_ACCESS_KEY_ID: v.pipe(v.string(), v.nonEmpty()),
  S3_BUCKET: v.pipe(v.string(), v.nonEmpty()),
  S3_ENDPOINT: v.pipe(v.string(), v.url()),
  S3_FORCE_PATH_STYLE: booleanFromString,
  S3_REGION: v.pipe(v.string(), v.nonEmpty()),
  S3_SECRET_ACCESS_KEY: v.pipe(v.string(), v.nonEmpty()),
  SHEETS_RETRY_LIMIT: integerFromString(0, 10),
  SHEETS_TIMEOUT_MS: integerFromString(100, 120_000),
  TRUST_PROXY: booleanFromString,
});

export type RuntimeEnvironment = v.InferOutput<typeof EnvironmentSchema>;

export class EnvironmentValidationError extends Error {
  public readonly invalidFields: readonly string[];

  public constructor(invalidFields: readonly string[]) {
    super(`Invalid environment configuration: ${invalidFields.join(', ')}`);
    this.name = 'EnvironmentValidationError';
    this.invalidFields = invalidFields;
  }
}

export function parseEnvironment(input: Record<string, string | undefined>): RuntimeEnvironment {
  const result = v.safeParse(EnvironmentSchema, input);

  if (result.success) {
    return result.output;
  }

  const invalidFields = result.issues.map((issue) => {
    const fieldPath = issue.path?.map((pathItem) => String(pathItem.key)).join('.');
    return fieldPath ?? 'environment';
  });

  throw new EnvironmentValidationError([...new Set(invalidFields)].sort());
}

export function loadEnvironment(): RuntimeEnvironment {
  return parseEnvironment(process.env);
}
