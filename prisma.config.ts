import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? buildDatabaseUrl(process.env);

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DIRECT_URL or DATABASE_URL must be configured for Prisma commands.');
}

export default defineConfig({
  datasource: {
    url: databaseUrl,
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  schema: 'prisma/schema.prisma',
});

function buildDatabaseUrl(environment: NodeJS.ProcessEnv): string | undefined {
  const host = environment['PUK_DATABASE_HOST'];
  const port = environment['PUK_DATABASE_PORT'];
  const database = environment['PUK_DATABASE_NAME'];
  const user = environment['PUK_DATABASE_USER'];
  const password = environment['PUK_DATABASE_PASSWORD'];
  const sslMode = environment['PUK_DATABASE_SSL_MODE'];

  if ([host, port, database, user, password].some((value) => value === undefined || value === '')) {
    return undefined;
  }

  const sslQuery = sslMode ? `&sslmode=${encodeURIComponent(sslMode)}` : '';
  return `postgresql://${encodeURIComponent(user!)}:${encodeURIComponent(password!)}@${host}:${port}/${encodeURIComponent(database!)}?schema=public${sslQuery}`;
}
