import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserRole } from '../generated/prisma/enums.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../shared/errors.js';
import { createPrismaClient } from './client.js';
import { updateOrderVersion } from './optimistic-lock.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseTests = describe.runIf(databaseUrl?.includes('/puk_test'));

databaseTests('database constraints', () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl!);
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        name: 'Constraint test',
        passwordHash: 'not-a-login-fixture',
        role: UserRole.ADMIN,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { createdById: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createOrder() {
    return prisma.order.create({
      data: {
        clientNameSnapshot: 'Test client',
        clientSheetId: 'TEST',
        createdById: userId,
        folio: `TEST-${randomUUID()}`,
        scheduledAt: new Date(),
        serviceType: 'INSTALLATION',
        units: {
          create: { label: 'Unit', makeModel: 'Test', serialNumber: randomUUID() },
        },
      },
      include: { units: true },
    });
  }

  it('enforces serial uniqueness within an order', async () => {
    const order = await createOrder();
    await expect(
      prisma.orderUnit.create({
        data: {
          label: 'Duplicate',
          makeModel: 'Test',
          orderId: order.id,
          serialNumber: order.units[0]!.serialNumber,
        },
      }),
    ).rejects.toThrow();
  });

  it('prevents the same equipment identity from being active twice', async () => {
    const first = await createOrder();
    const second = await createOrder();
    const equipment = {
      activeAssignment: true,
      externalKey: `equipment-${randomUUID()}`,
      rawSnapshot: {},
    };

    await prisma.orderEquipment.create({ data: { ...equipment, orderUnitId: first.units[0]!.id } });
    await expect(
      prisma.orderEquipment.create({ data: { ...equipment, orderUnitId: second.units[0]!.id } }),
    ).rejects.toThrow();
  });

  it('rejects a stale optimistic version', async () => {
    const order = await createOrder();
    await prisma.$transaction((transaction) =>
      updateOrderVersion(transaction, order.id, 1, { generalNotes: 'first' }),
    );
    await expect(
      prisma.$transaction((transaction) =>
        updateOrderVersion(transaction, order.id, 1, { generalNotes: 'stale' }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ code: 'ORDER_VERSION_CONFLICT', status: 409 }),
    );
  });
});
