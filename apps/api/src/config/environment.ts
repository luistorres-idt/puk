import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import * as v from 'valibot';

loadDotenv({
  path: process.env['DOTENV_CONFIG_PATH'] ?? resolve(import.meta.dirname, '../../../../.env'),
  quiet: true,
});

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

const optionalString = v.optional(
  v.pipe(
    v.string(),
    v.transform((value) => (value.trim().length === 0 ? undefined : value)),
  ),
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
  GOOGLE_DRIVE_CLIENT_EMAIL: optionalString,
  GOOGLE_DRIVE_PRIVATE_KEY: optionalString,
  GOOGLE_DRIVE_SHARED_DRIVE_ID: optionalString,
  GOOGLE_GMAIL_CLIENT_EMAIL: optionalString,
  GOOGLE_GMAIL_PRIVATE_KEY: optionalString,
  GOOGLE_GMAIL_SENDER_EMAIL: optionalString,
  GOOGLE_EQUIPMENT_SHEET: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_PRIVATE_KEY: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_SPREADSHEET_ID: v.pipe(v.string(), v.nonEmpty()),
  GOOGLE_TECHNICIANS_SHEET_NAME: v.optional(v.string(), 'DIRECTORIO TECNICO'),
  GOOGLE_TECHNICIAN_REPORT_SHEET_NAME: v.optional(v.string(), '2026'),
  GOOGLE_TECHNICIANS_SPREADSHEET_ID: optionalString,
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
  S3_ACCESS_KEY_ID: optionalString,
  S3_BUCKET: optionalString,
  S3_ENDPOINT: optionalString,
  S3_FORCE_PATH_STYLE: v.optional(booleanFromString),
  S3_REGION: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  SHEETS_RETRY_LIMIT: integerFromString(0, 10),
  SHEETS_TIMEOUT_MS: integerFromString(100, 120_000),
  STORAGE_PROVIDER: v.optional(v.picklist(['s3', 'drive']), 's3'),
  TECHNICAL_REPORT_CUTOFF_WEEKDAY: v.optional(integerFromString(0, 6), '2'),
  TECHNICAL_REPORT_SYNC_TIME: v.optional(
    v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
    '17:00',
  ),
  TECHNICAL_REPORT_SYNC_TIMEZONE: v.optional(
    v.pipe(v.string(), v.nonEmpty()),
    'America/Hermosillo',
  ),
  TECHNICAL_REPORT_SYNC_WEEKDAY: v.optional(integerFromString(0, 6), '3'),
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
  const databaseUrl =
    input['DATABASE_URL'] ??
    buildDatabaseUrl({
      database: input['PUK_DATABASE_NAME'],
      host: input['PUK_DATABASE_HOST'],
      password: input['PUK_DATABASE_PASSWORD'],
      port: input['PUK_DATABASE_PORT'],
      sslMode: input['PUK_DATABASE_SSL_MODE'],
      user: input['PUK_DATABASE_USER'],
    });
  const result = v.safeParse(EnvironmentSchema, {
    ...input,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: input['DIRECT_URL'] ?? databaseUrl,
  });

  if (result.success) {
    if (result.output.STORAGE_PROVIDER === 's3') {
      const missingS3Fields = [
        'S3_BUCKET',
        'S3_ENDPOINT',
        'S3_FORCE_PATH_STYLE',
        'S3_REGION',
      ].filter((field) => result.output[field as keyof typeof result.output] === undefined);
      if (missingS3Fields.length > 0) {
        throw new EnvironmentValidationError(missingS3Fields);
      }
      if (!v.safeParse(v.pipe(v.string(), v.url()), result.output.S3_ENDPOINT).success) {
        throw new EnvironmentValidationError(['S3_ENDPOINT']);
      }
    }
    if (result.output.STORAGE_PROVIDER === 'drive') {
      const missingDriveFields = [
        'GOOGLE_DRIVE_CLIENT_EMAIL',
        'GOOGLE_DRIVE_PRIVATE_KEY',
        'GOOGLE_DRIVE_SHARED_DRIVE_ID',
      ].filter((field) => !result.output[field as keyof typeof result.output]);
      if (missingDriveFields.length > 0) {
        throw new EnvironmentValidationError(missingDriveFields);
      }
      if (
        !v.safeParse(v.pipe(v.string(), v.email()), result.output.GOOGLE_DRIVE_CLIENT_EMAIL).success
      ) {
        throw new EnvironmentValidationError(['GOOGLE_DRIVE_CLIENT_EMAIL']);
      }
    }
    for (const field of ['GOOGLE_GMAIL_CLIENT_EMAIL', 'GOOGLE_GMAIL_SENDER_EMAIL'] as const) {
      const value = result.output[field];
      if (value && !v.safeParse(v.pipe(v.string(), v.email()), value).success)
        throw new EnvironmentValidationError([field]);
    }
    return result.output;
  }

  const invalidFields = result.issues.map((issue) => {
    const fieldPath = issue.path?.map((pathItem) => String(pathItem.key)).join('.');
    return fieldPath ?? 'environment';
  });

  throw new EnvironmentValidationError([...new Set(invalidFields)].sort());
}

export function buildDatabaseUrl(input: {
  database: string | undefined;
  host: string | undefined;
  password: string | undefined;
  port: string | undefined;
  sslMode?: string | undefined;
  user: string | undefined;
}): string | undefined {
  if (
    [input.database, input.host, input.password, input.port, input.user].some(
      (value) => value === undefined || value.length === 0,
    )
  ) {
    return undefined;
  }

  const sslMode =
    input.sslMode !== undefined && input.sslMode.trim().length > 0
      ? input.sslMode
      : input.host?.includes('rds.amazonaws.com')
        ? 'no-verify'
        : undefined;
  const sslQuery = sslMode ? `&sslmode=${encodeURIComponent(sslMode)}` : '';
  return `postgresql://${encodeURIComponent(input.user!)}:${encodeURIComponent(input.password!)}@${input.host}:${input.port}/${encodeURIComponent(input.database!)}?schema=public${sslQuery}`;
}

export function loadEnvironment(): RuntimeEnvironment {
  return parseEnvironment(process.env);
}
