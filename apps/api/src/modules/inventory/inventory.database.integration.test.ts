import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
import type {
  RegisterEquipment,
  AssignEquipment,
  ExternalEquipment,
  OrderServiceType,
} from '@puk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { createPrismaClient } from '../../database/client.js';
import {
  InventoryService,
  HybridEquipmentCatalog,
  reserveInventory,
  releaseInventory,
} from './index.js';
import { OrdersService } from '../orders/index.js';
import { OrderFinalizationService } from '../execution/index.js';
import type { CatalogServicePort } from '../../integrations/ports.js';

loadDotenv({ path: fileURLToPath(new URL('../../../../../.env', import.meta.url)), quiet: true });
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
describe.runIf(isolatedLocalDatabase(databaseUrl))('isolated PostgreSQL inventory', () => {
  let prisma: PrismaClient;
  let userId: string;
  let technicianId: string;
  let inventory: InventoryService;
  let orders: OrdersService;
  const sheetsRows: ExternalEquipment[] = [];
  let sheetsOffline = false;
  const sheets: CatalogServicePort = {
    getEquipment: async () => {
      if (sheetsOffline) throw new Error('offline');
      return { data: sheetsRows, fetchedAt: new Date().toISOString() };
    },
    getClients: async () => ({ data: [], fetchedAt: new Date().toISOString() }),
    findEquipmentByKey: async (key) => ({
      equipment: sheetsRows.find((e) => e.externalKey === key) ?? null,
      fetchedAt: new Date().toISOString(),
    }),
    invalidateCache: () => {},
  };
  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl!);
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        name: 'Inventory integration',
        passwordHash: 'not-a-login-fixture',
        role: 'ADMIN',
      },
    });
    userId = user.id;
    technicianId = (
      await prisma.technician.create({
        data: {
          name: 'Inventory technician',
          installationRate: 100,
          reviewRate: 100,
          uninstallationRate: 100,
          replacementRate: 100,
          fuelSensorRate: 100,
        },
      })
    ).id;
    inventory = new InventoryService(prisma, sheets);
    orders = new OrdersService(prisma, new HybridEquipmentCatalog(prisma, sheets));
  });
  afterAll(async () => {
    await prisma.equipment.updateMany({
      where: { createdById: userId },
      data: { reservedOrderId: null },
    });
    await prisma.order.deleteMany({ where: { createdById: userId } });
    await prisma.equipment.deleteMany({ where: { createdById: userId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.technician.delete({ where: { id: technicianId } });
    await prisma.$disconnect();
  });
  function input(
    serviceType: OrderServiceType = 'INSTALLATION',
    replacementRole?: 'OLD' | 'NEW',
  ): RegisterEquipment {
    return {
      registrationKey: randomUUID(),
      brand: 'GPS',
      model: 'Model',
      imei: `1${BigInt('0x' + randomUUID().replaceAll('-', ''))
        .toString()
        .slice(0, 14)}`,
      serviceType,
      ...(replacementRole ? { replacementRole } : {}),
      clientSheetId: 'C1',
      clientName: 'Client',
      ...(serviceType === 'REVIEW' || serviceType === 'UNINSTALLATION' || replacementRole === 'OLD'
        ? { unit: { label: 'Truck', makeModel: 'Make', serialNumber: randomUUID() } }
        : {}),
    };
  }
  const assignment = (e: ExternalEquipment): AssignEquipment => ({
    source: 'DB',
    inventoryEquipmentId: e.inventoryEquipmentId,
    externalKey: e.externalKey,
    brandSnapshot: 'untrusted',
    serviceStatusSnapshot: 'untrusted',
  });
  async function createOrder(
    equipment: AssignEquipment[],
    serviceType: OrderServiceType = 'INSTALLATION',
  ) {
    return orders.createOrder(userId, {
      clientSheetId: 'C1',
      clientNameSnapshot: 'Client',
      serviceType,
      technicianId,
      scheduledAt: new Date().toISOString(),
      units: [
        { label: 'Truck', makeModel: 'Make', serialNumber: randomUUID(), serviceType, equipment },
      ],
    });
  }
  it('persists installed context even if no order is saved and retry returns same ID while Sheets is down', async () => {
    const request = input('REVIEW');
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, request);
    sheetsOffline = true;
    try {
      expect(
        (await inventory.register({ id: userId, role: 'ADMIN' }, request)).inventoryEquipmentId,
      ).toBe(equipment.inventoryEquipmentId);
    } finally {
      sheetsOffline = false;
    }
    expect(
      await prisma.equipment.findUnique({ where: { id: equipment.inventoryEquipmentId! } }),
    ).toMatchObject({
      state: 'INSTALLED',
      currentClientSheetId: 'C1',
      unitSerialNumber: request.unit!.serialNumber,
      reservedOrderId: null,
    });
  });
  it('administers local metadata during Sheets outage without rewriting order snapshots', async () => {
    const actor = { id: userId, role: 'ADMIN' as const };
    const registered = await inventory.register(actor, input());
    const id = registered.inventoryEquipmentId!;
    await createOrder([assignment(registered)]);
    const snapshotBefore = await prisma.orderEquipment.findFirstOrThrow({
      where: { inventoryEquipmentId: id },
    });
    sheetsOffline = true;
    try {
      const listed = (await inventory.list(actor)).find((equipment) => equipment.id === id)!;
      expect(listed).toMatchObject({ canDelete: false, version: 1 });
      const updated = await inventory.update(actor, id, {
        imei: registered.imei!,
        brand: 'Corrected',
        model: 'Updated',
        version: listed.version,
      });
      expect(updated).toMatchObject({
        brand: 'Corrected',
        model: 'Updated',
        version: 2,
        imei: registered.imei,
      });
      expect(
        await prisma.orderEquipment.findUniqueOrThrow({ where: { id: snapshotBefore.id } }),
      ).toEqual(snapshotBefore);
      await expect(
        inventory.update(actor, id, {
          imei: registered.imei!,
          brand: 'Stale',
          model: 'Stale',
          version: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(inventory.remove(actor, id, { version: 2 })).rejects.toMatchObject({
        code: 'INVENTORY_EQUIPMENT_IN_USE',
      });
    } finally {
      sheetsOffline = false;
    }
  });
  it('changes an IMEI only when unique in DB and Sheets and preserves historical snapshots', async () => {
    const actor = { id: userId, role: 'ADMIN' as const };
    const registered = await inventory.register(actor, input());
    const id = registered.inventoryEquipmentId!;
    await createOrder([assignment(registered)]);
    const snapshot = await prisma.orderEquipment.findFirstOrThrow({
      where: { inventoryEquipmentId: id },
    });
    const changedImei = input().imei;

    await expect(
      inventory.update(actor, id, {
        imei: changedImei,
        brand: registered.brand!,
        model: registered.model!,
        version: 1,
      }),
    ).resolves.toMatchObject({ imei: changedImei, version: 2 });
    expect(await prisma.equipment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      id,
      imei: changedImei,
      version: 2,
    });
    expect(await prisma.orderEquipment.findUniqueOrThrow({ where: { id: snapshot.id } })).toEqual(
      snapshot,
    );
  });
  it('archives available equipment with terminal order history and rejects installed equipment', async () => {
    const actor = { id: userId, role: 'ADMIN' as const };
    const available = await inventory.register(actor, input());
    const installed = await inventory.register(actor, input('REVIEW'));
    const availableId = available.inventoryEquipmentId!;
    const order = await createOrder([assignment(available)]);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
    await expect(
      inventory.remove(actor, installed.inventoryEquipmentId!, { version: 1 }),
    ).rejects.toMatchObject({ code: 'INVENTORY_EQUIPMENT_IN_USE' });
    await expect(inventory.remove(actor, availableId, { version: 1 })).resolves.toEqual({
      deleted: true,
    });
    expect(await prisma.equipment.findUnique({ where: { id: availableId } })).toMatchObject({
      id: availableId,
      deletedAt: expect.any(Date),
    });
    const historicalSnapshot = await prisma.orderEquipment.findFirstOrThrow({
      where: { inventoryEquipmentId: availableId },
    });
    expect(historicalSnapshot).toMatchObject({
      inventoryEquipmentId: availableId,
      externalKey: `DB:${availableId}`,
      imei: available.imei,
    });
    const catalog = new HybridEquipmentCatalog(prisma, sheets);
    expect((await catalog.getEquipment()).data).not.toContainEqual(
      expect.objectContaining({ externalKey: `DB:${availableId}` }),
    );
    expect((await inventory.list(actor)).some((item) => item.id === availableId)).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: { entityId: availableId, action: 'INVENTORY_EQUIPMENT_DELETED' },
      }),
    ).toBe(1);
  });
  it('allows only one concurrent metadata change for a displayed version', async () => {
    const actor = { id: userId, role: 'ADMIN' as const };
    const equipment = await inventory.register(actor, input());
    const results = await Promise.allSettled(
      ['First', 'Second'].map((brand) =>
        inventory.update(actor, equipment.inventoryEquipmentId!, {
          imei: equipment.imei!,
          brand,
          model: 'Model',
          version: 1,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'INVENTORY_EQUIPMENT_CONFLICT' },
    });
  });
  it('enforces unique IMEI when two existing records are edited concurrently', async () => {
    const actor = { id: userId, role: 'ADMIN' as const };
    const first = await inventory.register(actor, input());
    const second = await inventory.register(actor, input());
    const sharedImei = input().imei;
    let checked = 0;
    let release!: () => void;
    const bothPreflightChecks = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getEquipment = vi.spyOn(sheets, 'getEquipment').mockImplementation(async () => {
      checked += 1;
      if (checked === 2) release();
      await bothPreflightChecks;
      return { data: [], fetchedAt: new Date().toISOString() };
    });
    const results = await Promise.allSettled(
      [first, second].map((equipment) =>
        inventory.update(actor, equipment.inventoryEquipmentId!, {
          imei: sharedImei,
          brand: equipment.brand!,
          model: equipment.model!,
          version: 1,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'DUPLICATE_IMEI', status: 409 },
    });
    expect(await prisma.equipment.count({ where: { imei: sharedImei } })).toBe(1);
    getEquipment.mockRestore();
  });
  it('enforces actual unique IMEI under simultaneous independent registrations', async () => {
    const first = input();
    const second = { ...first, registrationKey: randomUUID() };
    const results = await Promise.allSettled([
      inventory.register({ id: userId, role: 'ADMIN' }, first),
      inventory.register({ id: userId, role: 'ADMIN' }, second),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'DUPLICATE_IMEI', status: 409 },
    });
    expect(await prisma.equipment.count({ where: { imei: first.imei } })).toBe(1);
  });
  it('returns same committed equipment under simultaneous identical registration retries', async () => {
    const request = input();
    const [a, b] = await Promise.all([
      inventory.register({ id: userId, role: 'ADMIN' }, request),
      inventory.register({ id: userId, role: 'ADMIN' }, request),
    ]);
    expect(a.inventoryEquipmentId).toBe(b.inventoryEquipmentId);
    expect(
      await prisma.auditLog.count({
        where: {
          actorUserId: userId,
          entityId: a.inventoryEquipmentId!,
          action: 'INVENTORY_EQUIPMENT_REGISTERED',
        },
      }),
    ).toBe(1);
  });
  it('coalesces fresh Sheets reads while validating a multi-unit DB-only order', async () => {
    const first = await inventory.register({ id: userId, role: 'ADMIN' }, input());
    const secondInput = input();
    secondInput.imei = '987654321098765';
    const second = await inventory.register({ id: userId, role: 'ADMIN' }, secondInput);
    const readFresh = vi.spyOn(sheets, 'getEquipment');

    await orders.createOrder(userId, {
      clientSheetId: 'C1',
      clientNameSnapshot: 'Client',
      serviceType: 'INSTALLATION',
      technicianId,
      scheduledAt: new Date().toISOString(),
      units: [first, second].map((equipment) => ({
        label: 'Truck',
        makeModel: 'Make',
        serialNumber: randomUUID(),
        serviceType: 'INSTALLATION',
        equipment: [assignment(equipment)],
      })),
    });

    expect(readFresh).toHaveBeenCalledTimes(1);
  });
  it('atomically reserves one inventory record for only one competing order', async () => {
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input());
    const first = await createOrder([assignment(equipment)]);
    const second = await createOrder([assignment(equipment)]);
    const version = (
      await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.inventoryEquipmentId! } })
    ).version;
    const results = await Promise.allSettled(
      [first.id, second.id].map((id) =>
        prisma.$transaction((tx) =>
          reserveInventory(tx, equipment.inventoryEquipmentId!, id, version),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'EQUIPMENT_ALREADY_ASSIGNED' },
    });
    await prisma.$transaction((tx) => releaseInventory(tx, first.id));
    await prisma.$transaction((tx) => releaseInventory(tx, second.id));
  });
  it('rolls back a reservation when the caller transaction fails afterward', async () => {
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input());
    const order = await createOrder([assignment(equipment)]);
    const equipmentId = equipment.inventoryEquipmentId!;
    const before = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });

    await expect(
      prisma.$transaction(async (tx) => {
        await reserveInventory(tx, equipmentId, order.id, before.version);
        throw new Error('forced failure after reservation');
      }),
    ).rejects.toThrow('forced failure after reservation');

    const after = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(after).toMatchObject({
      reservedOrderId: before.reservedOrderId,
      version: before.version,
    });
  });
  it('uses authoritative DB snapshots, reserves without physical changes and preserves installed context on cancellation', async () => {
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input('REVIEW'));
    const order = await createOrder([assignment(equipment)], 'REVIEW');
    await orders.assignAndSyncOrder(userId, order.id);
    expect(
      await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.inventoryEquipmentId! } }),
    ).toMatchObject({ state: 'INSTALLED', reservedOrderId: order.id, currentClientSheetId: 'C1' });
    expect(
      await prisma.orderEquipment.findFirst({
        where: { inventoryEquipmentId: equipment.inventoryEquipmentId! },
      }),
    ).toMatchObject({ brandSnapshot: 'GPS', serviceStatusSnapshot: 'INSTALADO' });
    expect(
      await prisma.sheetSyncOperation.count({
        where: { orderId: order.id, operationType: 'SHEET_EQUIPMENT_ASSIGNMENT' },
      }),
    ).toBe(0);
    await orders.cancelOrder(userId, order.id);
    expect(
      await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.inventoryEquipmentId! } }),
    ).toMatchObject({
      state: 'INSTALLED',
      reservedOrderId: null,
      currentClientSheetId: 'C1',
      unitLabel: 'Truck',
    });
  });
  it('blocks canonical DB reuse while a compatible Sheets alias is actively assigned elsewhere', async () => {
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input('REVIEW'));
    const activeOrder = await createOrder([], 'REVIEW');
    const unit = await prisma.orderUnit.findFirstOrThrow({ where: { orderId: activeOrder.id } });
    const alias = `SHEET-${randomUUID()}`;
    await prisma.orderEquipment.create({
      data: {
        orderUnitId: unit.id,
        externalKey: alias,
        imei: equipment.imei,
        activeAssignment: true,
        rawSnapshot: {},
      },
    });
    sheetsRows.push({
      ...equipment,
      source: 'SHEETS',
      inventoryEquipmentId: null,
      externalKey: alias,
    });
    try {
      await expect(createOrder([assignment(equipment)], 'REVIEW')).rejects.toMatchObject({
        code: 'EQUIPMENT_ALREADY_ASSIGNED',
      });
    } finally {
      sheetsRows.pop();
    }
    expect(
      await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.inventoryEquipmentId! } }),
    ).toMatchObject({ reservedOrderId: null });
  });
  it('permits DB-only confirmation during Sheets outage while rejecting new registration', async () => {
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input());
    sheetsOffline = true;
    try {
      const order = await createOrder([assignment(equipment)]);
      await orders.assignAndSyncOrder(userId, order.id);
      await orders.cancelOrder(userId, order.id);
      await expect(
        inventory.register({ id: userId, role: 'ADMIN' }, input()),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      sheetsOffline = false;
    }
  });
  it.each(['INSTALLATION', 'FUEL_SENSOR', 'REVIEW', 'UNINSTALLATION'] as const)(
    'completes %s with DB physical state but no SALIDAS operation',
    async (service) => {
      const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input(service));
      const order = await createOrder([assignment(equipment)], service);
      await orders.assignAndSyncOrder(userId, order.id);
      await prisma.order.update({ where: { id: order.id }, data: { status: 'IN_PROGRESS' } });
      const finalization = new OrderFinalizationService(prisma);
      vi.spyOn(finalization, 'validateCompleteness').mockResolvedValue({
        isComplete: true,
        missingRequirements: [],
      });
      await finalization.completeOrder(userId, 'ADMIN', order.id);
      const installed = service !== 'UNINSTALLATION';
      expect(
        await prisma.equipment.findUniqueOrThrow({
          where: { id: equipment.inventoryEquipmentId! },
        }),
      ).toMatchObject({
        state: installed ? 'INSTALLED' : 'AVAILABLE',
        currentClientSheetId: installed ? 'C1' : null,
        reservedOrderId: null,
      });
      expect(
        await prisma.sheetSyncOperation.count({
          where: { orderId: order.id, operationType: 'SHEET_EQUIPMENT_ASSIGNMENT' },
        }),
      ).toBe(0);
      expect(
        await prisma.sheetSyncOperation.count({
          where: { orderId: order.id, operationType: 'SHEET_TECHNICAL_REPORT' },
        }),
      ).toBe(1);
    },
  );
  it('supports a mixed replacement: installed DB old goes to stock and Sheets new preserves its SALIDAS operations', async () => {
    const old = await inventory.register(
      { id: userId, role: 'ADMIN' },
      input('EQUIPMENT_REPLACEMENT', 'OLD'),
    );
    const key = `SHEET-${randomUUID()}`;
    const fresh: ExternalEquipment = {
      ...old,
      source: 'SHEETS',
      inventoryEquipmentId: null,
      externalKey: key,
      imei: 'legacy-new',
      serviceStatus: 'DISPONIBLE',
      currentClient: null,
      currentClientSheetId: null,
      rowNumber: 5,
    };
    sheetsRows.push(fresh);
    try {
      const order = await createOrder(
        [
          assignment(old),
          { externalKey: key, imei: fresh.imei, serviceStatusSnapshot: fresh.serviceStatus },
        ],
        'EQUIPMENT_REPLACEMENT',
      );
      await orders.assignAndSyncOrder(userId, order.id);
      await prisma.order.update({ where: { id: order.id }, data: { status: 'IN_PROGRESS' } });
      const finalization = new OrderFinalizationService(prisma);
      vi.spyOn(finalization, 'validateCompleteness').mockResolvedValue({
        isComplete: true,
        missingRequirements: [],
      });
      await finalization.completeOrder(userId, 'ADMIN', order.id);
      expect(
        await prisma.equipment.findUniqueOrThrow({ where: { id: old.inventoryEquipmentId! } }),
      ).toMatchObject({ state: 'AVAILABLE', currentClientSheetId: null });
      const operations = await prisma.sheetSyncOperation.findMany({
        where: { orderId: order.id, operationType: 'SHEET_EQUIPMENT_ASSIGNMENT' },
      });
      expect(operations).toHaveLength(2);
      expect(
        operations.every((op) => (op.payload as { externalKey: string }).externalKey === key),
      ).toBe(true);
    } finally {
      sheetsRows.pop();
    }
  });
  it('blocks later cross-source identity conflict without modifying either record', async () => {
    const equipment = await inventory.register({ id: userId, role: 'ADMIN' }, input());
    sheetsRows.push({
      ...equipment,
      source: 'SHEETS',
      inventoryEquipmentId: null,
      externalKey: `SHEET-${randomUUID()}`,
      serviceStatus: 'INSTALADO',
      currentClient: 'Another client',
      currentClientSheetId: null,
    });
    try {
      await expect(createOrder([assignment(equipment)])).rejects.toMatchObject({
        code: 'EQUIPMENT_IDENTITY_CONFLICT',
      });
    } finally {
      sheetsRows.pop();
    }
    expect(
      await prisma.equipment.findUniqueOrThrow({ where: { id: equipment.inventoryEquipmentId! } }),
    ).toMatchObject({ state: 'AVAILABLE', reservedOrderId: null });
  });
});
