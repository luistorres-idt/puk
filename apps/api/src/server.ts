import { createApp } from './app.js';
import { TokenService } from './auth/tokens.js';
import { loadEnvironment } from './config/environment.js';
import { createPrismaClient } from './database/client.js';
import { DevMockSheetsClient } from './integrations/google-sheets/dev-mock-sheets.client.js';
import { GoogleSheetsClient } from './integrations/google-sheets/google-sheets.client.js';
import { GoogleSheetsCatalogService } from './integrations/google-sheets/google-sheets.service.js';

const environment = loadEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const normalizePem = (value: string) => value.replaceAll('\\n', '\n');
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
      privateKey: environment.GOOGLE_PRIVATE_KEY,
      timeoutMs: environment.SHEETS_TIMEOUT_MS,
    });

const catalogsService = new GoogleSheetsCatalogService(
  sheetsPort,
  environment.CATALOG_CACHE_TTL_SECONDS,
);

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
