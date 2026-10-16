import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_ORDER_QUERY_OFFSET } from '@puk/contracts';
import { PrismaClient } from '../../generated/prisma/client.js';

function isolatedDatabaseUrl(value?: string): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.pathname === '/puk_test'
    ) {
      return url;
    }
  } catch {
    // Never include the configured connection string in test diagnostics.
  }
  return undefined;
}

function createReadOnlyClient(url: URL) {
  return new PrismaClient({
    adapter: new PrismaPg({
      // Explicit fields prevent connection-string query parameters from overriding the host.
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: 'puk_test',
      connectionTimeoutMillis: 3000,
      statement_timeout: 3000,
      query_timeout: 4000,
      options: '-c default_transaction_read_only=on',
    }),
    log: [{ emit: 'event', level: 'query' }],
  });
}

async function sanitizedQuery<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch {
    throw new Error('Isolated read-only pagination query failed; connection details omitted.');
  }
}

const databaseUrl = isolatedDatabaseUrl(process.env['TEST_DATABASE_URL']);

describe.runIf(databaseUrl !== undefined)('isolated PostgreSQL pagination boundary', () => {
  let prisma: ReturnType<typeof createReadOnlyClient>;
  let offsetParameters: string[];

  beforeAll(async () => {
    prisma = createReadOnlyClient(databaseUrl!);
    offsetParameters = [];
    prisma.$on('query', (event) => {
      const offset = /OFFSET \$(\d+)/.exec(event.query);
      if (offset) {
        const parameters: unknown[] = JSON.parse(event.params);
        offsetParameters.push(String(parameters[Number(offset[1]) - 1]));
      }
    });
    const settings = await sanitizedQuery(
      () =>
        prisma.$queryRaw<Array<{ database: string; read_only: string }>>`
        SELECT current_database() AS database,
               current_setting('transaction_read_only') AS read_only
      `,
    );
    expect(settings).toEqual([{ database: 'puk_test', read_only: 'on' }]);
  });

  afterAll(async () => {
    if (prisma) await sanitizedQuery(() => prisma.$disconnect());
  });

  it.each([2_147_483_647, 2_147_483_648, MAX_ORDER_QUERY_OFFSET - 1, MAX_ORDER_QUERY_OFFSET])(
    'sends skip %i intact through Prisma to PostgreSQL',
    async (skip) => {
      offsetParameters.length = 0;
      // This compiles to WHERE 1=0: no fixtures, writes or deep table scans.
      const rows = await sanitizedQuery(() =>
        prisma.order.findMany({ where: { id: { in: [] } }, select: { id: true }, skip, take: 1 }),
      );
      expect(rows).toEqual([]);
      // Empty results alone cannot detect the silent uint32 wrap observed beyond this bound.
      expect(offsetParameters).toEqual([String(skip)]);
    },
  );
});
