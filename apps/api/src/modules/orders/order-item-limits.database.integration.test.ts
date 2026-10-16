import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaClient as PrismaClientConstructor } from '../../generated/prisma/client.js';
import { OrdersService } from './orders.service.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
function isolatedLocalDatabase(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.pathname === '/puk_test'
    );
  } catch {
    return false;
  }
}

function createTestPrismaClient(connectionString: string): PrismaClient {
  const url = new URL(connectionString);
  return new PrismaClientConstructor({
    adapter: new PrismaPg({
      // Pass explicit fields so query parameters cannot override the validated loopback host.
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: 'puk_test',
      connectionTimeoutMillis: 3000,
      statement_timeout: 15_000,
      query_timeout: 20_000,
    }),
  });
}

describe.runIf(isolatedLocalDatabase(databaseUrl))('isolated PostgreSQL order-item limits', () => {
  let prisma: PrismaClient;
  let orders: OrdersService;
  let userId: string;
  let technicianId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    prisma = createTestPrismaClient(databaseUrl!);
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        name: 'Order limits integration',
        passwordHash: 'not-a-login-fixture',
        role: 'ADMIN',
      },
    });
    userId = user.id;
    technicianId = (
      await prisma.technician.create({
        data: {
          name: 'Order limits technician',
          installationRate: 100,
          reviewRate: 100,
          uninstallationRate: 100,
          replacementRate: 100,
          fuelSensorRate: 100,
        },
      })
    ).id;
    orders = new OrdersService(prisma);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.technician.delete({ where: { id: technicianId } });
    await prisma.$disconnect();
  });

  it('serializes concurrent unit additions at the final available slot', async () => {
    const order = await orders.createOrder(userId, {
      clientSheetId: 'LIMITS-CLIENT',
      clientNameSnapshot: 'Order limits client',
      serviceType: 'INSTALLATION',
      technicianId,
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    createdOrderIds.push(order.id);
    await prisma.orderUnit.createMany({
      data: Array.from({ length: 99 }, (_, index) => ({
        orderId: order.id,
        label: `Existing unit ${index}`,
        makeModel: 'Model',
        serialNumber: `existing-${randomUUID()}`,
      })),
    });

    const auditCountBefore = await prisma.auditLog.count({
      where: { actorUserId: userId, action: 'UNIT_ADDED', entityType: 'OrderUnit' },
    });
    const results = await Promise.allSettled(
      [1, 2].map((index) =>
        orders.addUnit(userId, order.id, {
          label: `Concurrent unit ${index}`,
          makeModel: 'Model',
          serialNumber: `concurrent-${randomUUID()}`,
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 400, code: 'ORDER_UNIT_LIMIT_EXCEEDED' },
    });
    expect(await prisma.orderUnit.count({ where: { orderId: order.id } })).toBe(100);
    expect(
      await prisma.auditLog.count({
        where: { actorUserId: userId, action: 'UNIT_ADDED', entityType: 'OrderUnit' },
      }),
    ).toBe(auditCountBefore + 1);
  });

  it('serializes concurrent equipment additions at the final available slot', async () => {
    const order = await orders.createOrder(userId, {
      clientSheetId: 'LIMITS-EQUIPMENT-CLIENT',
      clientNameSnapshot: 'Order equipment limits client',
      serviceType: 'INSTALLATION',
      technicianId,
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    createdOrderIds.push(order.id);
    const unit = await prisma.orderUnit.create({
      data: {
        orderId: order.id,
        label: 'Equipment limit unit',
        makeModel: 'Model',
        serialNumber: `equipment-limit-${randomUUID()}`,
      },
    });
    await prisma.orderEquipment.createMany({
      data: Array.from({ length: 499 }, (_, index) => ({
        orderUnitId: unit.id,
        externalKey: `existing-${index}-${randomUUID()}`,
        rawSnapshot: {},
      })),
    });

    const auditCountBefore = await prisma.auditLog.count({
      where: { actorUserId: userId, action: 'EQUIPMENT_ASSIGNED', entityType: 'OrderEquipment' },
    });
    const results = await Promise.allSettled(
      [1, 2].map((index) =>
        orders.assignEquipment(userId, order.id, unit.id, {
          source: 'SHEETS',
          externalKey: `concurrent-${index}-${randomUUID()}`,
        }),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 400, code: 'ORDER_EQUIPMENT_LIMIT_EXCEEDED' },
    });
    expect(await prisma.orderEquipment.count({ where: { orderUnit: { orderId: order.id } } })).toBe(
      500,
    );
    expect(
      await prisma.auditLog.count({
        where: { actorUserId: userId, action: 'EQUIPMENT_ASSIGNED', entityType: 'OrderEquipment' },
      }),
    ).toBe(auditCountBefore + 1);
  }, 30_000);

  it('rolls back equipment creation when its audit actor violates the foreign key', async () => {
    const order = await orders.createOrder(userId, {
      clientSheetId: 'LIMITS-ROLLBACK-CLIENT',
      clientNameSnapshot: 'Order rollback client',
      serviceType: 'INSTALLATION',
      technicianId,
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    createdOrderIds.push(order.id);
    const unit = await prisma.orderUnit.create({
      data: {
        orderId: order.id,
        label: 'Rollback unit',
        makeModel: 'Model',
        serialNumber: `rollback-${randomUUID()}`,
      },
    });
    const equipmentCountBefore = await prisma.orderEquipment.count({
      where: { orderUnit: { orderId: order.id } },
    });
    const auditCountBefore = await prisma.auditLog.count({
      where: { action: 'EQUIPMENT_ASSIGNED', entityType: 'OrderEquipment' },
    });

    await expect(
      orders.assignEquipment(randomUUID(), order.id, unit.id, {
        source: 'SHEETS',
        externalKey: `rollback-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    expect(await prisma.orderEquipment.count({ where: { orderUnit: { orderId: order.id } } })).toBe(
      equipmentCountBefore,
    );
    expect(
      await prisma.auditLog.count({
        where: { action: 'EQUIPMENT_ASSIGNED', entityType: 'OrderEquipment' },
      }),
    ).toBe(auditCountBefore);
  }, 30_000);

  it('creates one order for concurrent and subsequent retries with the same idempotency key', async () => {
    const key = randomUUID();
    const input = {
      clientSheetId: 'IDEMPOTENCY-CLIENT',
      clientNameSnapshot: 'Order idempotency integration',
      serviceType: 'INSTALLATION' as const,
      technicianId,
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    };

    const [created, concurrentReplay] = await Promise.all([
      orders.createOrder(userId, input, key),
      orders.createOrder(userId, input, key),
    ]);
    createdOrderIds.push(created.id);

    expect(concurrentReplay.id).toBe(created.id);
    expect(
      await prisma.order.count({
        where: { createdById: userId, creationIdempotencyKey: key },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { actorUserId: userId, action: 'ORDER_CREATED', entityId: created.id },
      }),
    ).toBe(1);

    const replay = await orders.createOrder(userId, input, key);
    expect(replay.id).toBe(created.id);

    await expect(
      orders.createOrder(userId, { ...input, generalNotes: 'Changed request body' }, key),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
