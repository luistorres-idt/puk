import { hashPassword } from '../apps/api/src/auth/password.js';
import { createPrismaClient } from '../apps/api/src/database/client.js';
import { UserRole } from '../apps/api/src/generated/prisma/enums.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const seedPrisma = createSeedDependencies();

export async function seedUsers(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: SeedDependencies = seedPrisma,
): Promise<void> {
  const databaseUrl =
    environment['TEST_DATABASE_URL'] ??
    environment['DIRECT_URL'] ??
    environment['DATABASE_URL'] ??
    buildDatabaseUrl(environment);
  if (databaseUrl === undefined) {
    throw new Error('TEST_DATABASE_URL, DIRECT_URL, or DATABASE_URL is required.');
  }

  const adminEmail = (environment['SEED_ADMIN_EMAIL'] ?? 'admin@staging.invalid')
    .trim()
    .toLowerCase();
  const adminPassword = environment['SEED_ADMIN_PASSWORD'] ?? 'development-only-change-me';
  const clientAdminEmail = environment['SEED_CLIENT_ADMIN_EMAIL']?.trim().toLowerCase();
  const clientAdminPassword = environment['SEED_CLIENT_ADMIN_PASSWORD'];
  const hasClientAdminCredentials =
    clientAdminEmail !== undefined || clientAdminPassword !== undefined;

  if (environment['NODE_ENV'] === 'production') {
    if (environment['SEED_ADMIN_PASSWORD'] === undefined) {
      throw new Error('SEED_ADMIN_PASSWORD is required in production.');
    }
    if (!clientAdminEmail || !clientAdminPassword) {
      throw new Error(
        'SEED_CLIENT_ADMIN_EMAIL and SEED_CLIENT_ADMIN_PASSWORD are required in production.',
      );
    }
  }
  if (hasClientAdminCredentials && (!clientAdminEmail || !clientAdminPassword)) {
    throw new Error('Both client admin seed settings must be provided together.');
  }
  if (clientAdminEmail && clientAdminEmail === adminEmail) {
    throw new Error('The internal and client admin accounts must use different email addresses.');
  }

  const adminPasswordHash = await dependencies.hashPassword(adminPassword);
  const clientAdminPasswordHash = clientAdminPassword
    ? await dependencies.hashPassword(clientAdminPassword)
    : undefined;
  const prisma = dependencies.createPrismaClient(databaseUrl);

  try {
    const technician = await prisma.technician.upsert({
      create: { id: '00000000-0000-4000-8000-000000000002', name: 'Técnico de desarrollo' },
      update: {},
      where: { id: '00000000-0000-4000-8000-000000000002' },
    });

    const admin = await prisma.user.upsert({
      create: {
        email: adminEmail,
        name: 'Administrador de desarrollo',
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
      },
      update: {},
      where: { email: adminEmail },
    });

    if (clientAdminEmail && clientAdminPasswordHash) {
      await prisma.user.upsert({
        create: {
          email: clientAdminEmail,
          name: 'Administrador del cliente',
          passwordHash: clientAdminPasswordHash,
          role: UserRole.ADMIN,
        },
        update: {},
        where: { email: clientAdminEmail },
      });
    }

    await prisma.user.upsert({
      create: {
        email: environment['SEED_TECHNICIAN_EMAIL'] ?? 'technician@example.invalid',
        name: technician.name,
        passwordHash: adminPasswordHash,
        role: UserRole.TECHNICIAN,
        technicianId: technician.id,
      },
      update: {},
      where: { email: environment['SEED_TECHNICIAN_EMAIL'] ?? 'technician@example.invalid' },
    });

    if (isTestDatabase(databaseUrl, environment)) {
      await prisma.order.upsert({
        where: { id: '00000000-0000-4000-8000-000000000003' },
        update: {},
        create: {
          id: '00000000-0000-4000-8000-000000000003',
          folio: 'TEST-SEED-001',
          serviceType: 'INSTALLATION',
          status: 'DRAFT',
          clientSheetId: 'TEST-SEED-CLIENT',
          clientNameSnapshot: 'Cliente de pruebas',
          technicianId: technician.id,
          technicianNameSnapshot: technician.name,
          scheduledAt: new Date('2026-01-15T17:00:00.000Z'),
          createdById: admin.id,
          units: {
            create: {
              label: 'Unidad de prueba',
              makeModel: 'Modelo de prueba',
              serialNumber: 'TEST-SEED-SERIAL-001',
            },
          },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await seedUsers();
  process.stdout.write('Development users and technician seeded.\n');
}

interface SeedUserCreate {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  technicianId?: string;
}

interface SeedPrismaClient {
  technician: {
    upsert(args: {
      create: { id: string; name: string };
      update: Record<string, never>;
      where: { id: string };
    }): Promise<{ id: string; name: string }>;
  };
  user: {
    upsert(args: {
      create: SeedUserCreate;
      update: Record<string, never>;
      where: { email: string };
    }): Promise<{ id: string }>;
  };
  order: {
    upsert(args: {
      create: {
        id: string;
        folio: string;
        serviceType: 'INSTALLATION';
        status: 'DRAFT';
        clientSheetId: string;
        clientNameSnapshot: string;
        technicianId: string;
        technicianNameSnapshot: string;
        scheduledAt: Date;
        createdById: string;
        units: { create: { label: string; makeModel: string; serialNumber: string } };
      };
      update: Record<string, never>;
      where: { id: string };
    }): Promise<unknown>;
  };
  $disconnect(): Promise<void>;
}

interface SeedDependencies {
  createPrismaClient(databaseUrl: string): SeedPrismaClient;
  hashPassword(password: string): Promise<string>;
}

function createSeedDependencies(): SeedDependencies {
  return {
    createPrismaClient: (databaseUrl) =>
      createPrismaClient(databaseUrl) as unknown as SeedPrismaClient,
    hashPassword,
  };
}

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

function isTestDatabase(databaseUrl: string, environment: NodeJS.ProcessEnv): boolean {
  try {
    const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '').split('/')[0];
    return (
      databaseName === 'puk_test' ||
      (environment['SEED_TEST_DATA'] === 'true' && environment['NODE_ENV'] === 'test')
    );
  } catch {
    return false;
  }
}
