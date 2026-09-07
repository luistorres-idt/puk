import { createApp } from './app.js';
import { TokenService } from './auth/tokens.js';
import { loadEnvironment } from './config/environment.js';
import { createPrismaClient } from './database/client.js';
import { DevMockSheetsClient } from './integrations/google-sheets/dev-mock-sheets.client.js';
import { GoogleSheetsClient } from './integrations/google-sheets/google-sheets.client.js';
import { GoogleSheetsCatalogService } from './integrations/google-sheets/google-sheets.service.js';
import { OrdersService, SyncService } from './modules/orders/index.js';
import { ExecutionService } from './modules/execution/index.js';
import { S3StorageClient } from './integrations/object-storage/s3.client.js';
import { DevMockStorageClient } from './integrations/object-storage/dev-mock-storage.client.js';
import { ReportsService } from './modules/reports/index.js';

const environment = loadEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const normalizePem = (value: string) => {
  let v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replaceAll('\\n', '\n').trim();
};
const tokenMetadata = {
  accessTtl: environment.JWT_ACCESS_TTL,
  audience: environment.JWT_AUDIENCE,
  issuer: environment.JWT_ISSUER,
  refreshTtl: environment.JWT_REFRESH_TTL,
};

const usesPlaceholderKeys =
  environment.NODE_ENV !== 'production' &&
  environment.JWT_ACCESS_PRIVATE_KEY.startsWith('development-only');

const tokens = usesPlaceholderKeys
  ? await TokenService.forDevelopment(tokenMetadata)
  : await TokenService.fromPem({
      ...tokenMetadata,
      accessPrivateKey: normalizePem(environment.JWT_ACCESS_PRIVATE_KEY),
      accessPublicKey: normalizePem(environment.JWT_ACCESS_PUBLIC_KEY),
      refreshPrivateKey: normalizePem(environment.JWT_REFRESH_PRIVATE_KEY),
      refreshPublicKey: normalizePem(environment.JWT_REFRESH_PUBLIC_KEY),
    });

const usesPlaceholderSheets =
  environment.NODE_ENV !== 'production' &&
  (environment.GOOGLE_PRIVATE_KEY.startsWith('development-only') ||
    environment.GOOGLE_SPREADSHEET_ID.startsWith('development-only'));

const sheetsPort = usesPlaceholderSheets
  ? new DevMockSheetsClient()
  : new GoogleSheetsClient({
      spreadsheetId: environment.GOOGLE_SPREADSHEET_ID,
      clientsSheetName: environment.GOOGLE_CLIENTS_SHEET,
      equipmentSheetName: environment.GOOGLE_EQUIPMENT_SHEET,
      clientEmail: environment.GOOGLE_CLIENT_EMAIL,
      privateKey: normalizePem(environment.GOOGLE_PRIVATE_KEY),
      timeoutMs: environment.SHEETS_TIMEOUT_MS,
    });

const catalogsService = new GoogleSheetsCatalogService(
  sheetsPort,
  environment.CATALOG_CACHE_TTL_SECONDS,
);

const ordersService = new OrdersService(prisma, catalogsService);
const syncService = new SyncService(prisma, sheetsPort, {
  maxRetries: environment.SHEETS_RETRY_LIMIT,
});

const syncInterval = setInterval(() => {
  syncService.processPendingOperations().catch(() => {});
}, environment.OUTBOX_POLL_INTERVAL_MS);
syncInterval.unref();

const usesPlaceholderStorage =
  environment.NODE_ENV !== 'production' &&
  environment.S3_ACCESS_KEY_ID?.startsWith('development-only') === true;

const storagePort = usesPlaceholderStorage
  ? new DevMockStorageClient()
  : new S3StorageClient({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      bucket: environment.S3_BUCKET,
      ...(environment.S3_ACCESS_KEY_ID === undefined
        ? {}
        : { accessKeyId: environment.S3_ACCESS_KEY_ID }),
      ...(environment.S3_SECRET_ACCESS_KEY === undefined
        ? {}
        : { secretAccessKey: environment.S3_SECRET_ACCESS_KEY }),
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    });

const reportsService = new ReportsService(
  prisma,
  storagePort,
  environment.PRESIGNED_URL_TTL_SECONDS,
);

const reportsInterval = setInterval(() => {
  reportsService.processPendingReports().catch(() => {});
}, environment.OUTBOX_POLL_INTERVAL_MS);
reportsInterval.unref();

const executionService = new ExecutionService(prisma, storagePort, {
  maxEvidenceBytes: environment.MAX_EVIDENCE_BYTES,
  maxSignatureBytes: environment.MAX_SIGNATURE_BYTES,
  presignedUrlTtlSeconds: environment.PRESIGNED_URL_TTL_SECONDS,
  reportGeneration: reportsService,
});

const server = createApp({
  allowedOrigins: [environment.APP_ORIGIN],
  auth: {
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
      sameSite: environment.COOKIE_SAME_SITE,
      secure: environment.COOKIE_SECURE,
      ...(environment.COOKIE_DOMAIN === undefined ? {} : { domain: environment.COOKIE_DOMAIN }),
    },
    minimumPasswordLength: environment.MIN_PASSWORD_LENGTH,
    prisma,
    tokens,
  },
  catalogsService,
  ordersService,
  syncService,
  executionService,
  reportsService,
  dependencyCheck: async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
  trustProxy: environment.TRUST_PROXY,
}).listen(environment.PORT);

server.on('error', (error) => {
  process.stderr.write(`API server error: ${error.message}\n`);
  process.exitCode = 1;
});

function stopServer(): void {
  clearInterval(reportsInterval);
  clearInterval(syncInterval);
  const forceExitTimeout = setTimeout(() => process.exit(1), 10_000);
  forceExitTimeout.unref();

  server.close(async (error) => {
    clearTimeout(forceExitTimeout);
    await prisma.$disconnect();

    if (error !== undefined) {
      process.stderr.write(`API shutdown error: ${error.message}\n`);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.once('SIGINT', stopServer);
process.once('SIGTERM', stopServer);
