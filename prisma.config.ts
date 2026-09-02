import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const databaseUrl = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

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
