import { hashPassword } from '../apps/api/src/auth/password.js';
import { createPrismaClient } from '../apps/api/src/database/client.js';
import { UserRole } from '../apps/api/src/generated/prisma/enums.js';

const databaseUrl =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? buildDatabaseUrl(process.env);
if (databaseUrl === undefined) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const password = process.env.SEED_ADMIN_PASSWORD ?? 'development-only-change-me';
if (process.env.NODE_ENV === 'production' && process.env.SEED_ADMIN_PASSWORD === undefined) {
  throw new Error('SEED_ADMIN_PASSWORD is required in production.');
}
const passwordHash = await hashPassword(password);

const prisma = createPrismaClient(databaseUrl);
const technician = await prisma.technician.upsert({
  create: { id: '00000000-0000-4000-8000-000000000002', name: 'Técnico de desarrollo' },
  update: {},
  where: { id: '00000000-0000-4000-8000-000000000002' },
});

await prisma.user.upsert({
  create: {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.invalid',
    name: 'Administrador de desarrollo',
    passwordHash,
    role: UserRole.ADMIN,
  },
  update: {},
  where: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.invalid' },
});

await prisma.user.upsert({
  create: {
    email: process.env.SEED_TECHNICIAN_EMAIL ?? 'technician@example.invalid',
    name: technician.name,
    passwordHash,
    role: UserRole.TECHNICIAN,
    technicianId: technician.id,
  },
  update: {},
  where: { email: process.env.SEED_TECHNICIAN_EMAIL ?? 'technician@example.invalid' },
});

await prisma.$disconnect();
process.stdout.write('Development users and technician seeded.\n');

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
