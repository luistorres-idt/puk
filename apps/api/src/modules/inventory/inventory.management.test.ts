import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { EquipmentCatalogPort } from '../../integrations/ports.js';
import { InventoryService } from './inventory.service.js';

const admin = { id: 'admin', role: 'ADMIN' as const };
const initial = {
  id: 'equipment',
  imei: '012345678901234',
  brand: 'GPS',
  model: 'Model',
  state: 'AVAILABLE',
  currentClientSheetId: null,
  currentClientName: null,
  unitLabel: null,
  unitMakeModel: null,
  unitSerialNumber: null,
  unitYear: null,
  reservedOrderId: null,
  deletedAt: null,
  version: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
function setup() {
  const equipment = {
    findMany: vi.fn().mockResolvedValue([initial]),
    findUnique: vi.fn().mockResolvedValue(initial),
    findFirst: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const orderEquipment = {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const audit = vi.fn();
  const getEquipment = vi.fn().mockRejectedValue(new Error('Sheets offline'));
  const prisma = {
    equipment,
    $transaction: vi.fn(async (work) =>
      work({ equipment, orderEquipment, auditLog: { createMany: audit } }),
    ),
  };
  return {
    equipment,
    orderEquipment,
    audit,
    getEquipment,
    service: new InventoryService(
      prisma as unknown as PrismaClient,
      { getEquipment } as EquipmentCatalogPort,
    ),
  };
}
describe('equipment administration', () => {
  beforeEach(() => vi.clearAllMocks());
  it('lists only local inventory without Sheets and exposes safe management fields', async () => {
    const f = setup();
    expect(await f.service.list(admin)).toEqual([
      {
        id: initial.id,
        imei: initial.imei,
        brand: initial.brand,
        model: initial.model,
        state: initial.state,
        currentClientSheetId: initial.currentClientSheetId,
        currentClientName: initial.currentClientName,
        unitLabel: initial.unitLabel,
        unitMakeModel: initial.unitMakeModel,
        unitSerialNumber: initial.unitSerialNumber,
        unitYear: initial.unitYear,
        reservedOrderId: initial.reservedOrderId,
        version: initial.version,
        createdAt: initial.createdAt.toISOString(),
        updatedAt: initial.updatedAt.toISOString(),
        canDelete: true,
      },
    ]);
    expect(f.getEquipment).not.toHaveBeenCalled();
    expect(f.equipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
  it('enforces ADMIN on all operations before database access', async () => {
    const f = setup();
    const technician = { id: 'tech', role: 'TECHNICIAN' as const };
    await expect(f.service.list(technician)).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.update(technician, initial.id, {
        imei: initial.imei,
        brand: 'A',
        model: 'B',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(f.service.remove(technician, initial.id, { version: 1 })).rejects.toMatchObject({
      status: 403,
    });
    expect(f.equipment.findUnique).not.toHaveBeenCalled();
    expect(f.equipment.findMany).not.toHaveBeenCalled();
  });
  it('updates brand and model with compare-and-swap without Sheets when IMEI is unchanged', async () => {
    const f = setup();
    f.equipment.findUnique
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...initial, brand: 'New', version: 2 });
    expect(
      await f.service.update(admin, initial.id, {
        imei: initial.imei,
        brand: ' New ',
        model: ' Model ',
        version: 1,
      }),
    ).toMatchObject({ brand: 'New', version: 2 });
    expect(f.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: initial.id, version: 1 },
      data: { imei: initial.imei, brand: 'New', model: 'Model', version: { increment: 1 } },
    });
    expect(f.getEquipment).not.toHaveBeenCalled();
    expect(f.audit).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'INVENTORY_EQUIPMENT_UPDATED',
          before: expect.objectContaining({ version: 1 }),
          after: expect.objectContaining({ version: 2 }),
        }),
      ],
    });
  });
  it('validates changed IMEI against local inventory and fresh Sheets, then audits it', async () => {
    const f = setup();
    const imei = '999999999999999';
    f.equipment.findUnique
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({ ...initial, imei, version: 2 });
    f.getEquipment.mockResolvedValue({ data: [], fetchedAt: new Date().toISOString() });
    await expect(
      f.service.update(admin, initial.id, {
        imei,
        brand: 'GPS',
        model: 'Model',
        version: 1,
      }),
    ).resolves.toMatchObject({ imei, version: 2 });
    expect(f.equipment.findFirst).toHaveBeenCalledWith({
      where: { imei, id: { not: initial.id } },
      select: { id: true },
    });
    expect(f.getEquipment).toHaveBeenCalledWith({ forceFresh: true });
    expect(f.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: initial.id, version: 1 },
      data: { imei, brand: 'GPS', model: 'Model', version: { increment: 1 } },
    });
    expect(f.audit).toHaveBeenCalledWith({
      data: [expect.objectContaining({ after: expect.objectContaining({ imei }) })],
    });
  });
  it('rejects duplicate IMEIs from local records or Sheets and fails closed while Sheets is down', async () => {
    const f = setup();
    const duplicate = '999999999999999';
    f.equipment.findFirst.mockResolvedValue({ id: 'other-equipment' });
    await expect(
      f.service.update(admin, initial.id, {
        imei: duplicate,
        brand: 'GPS',
        model: 'Model',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_IMEI' });
    expect(f.getEquipment).not.toHaveBeenCalled();
    expect(f.equipment.updateMany).not.toHaveBeenCalled();

    f.equipment.findFirst.mockResolvedValue(null);
    f.getEquipment.mockResolvedValue({
      data: [{ imei: duplicate, externalKey: 'SHEET-1' }],
      fetchedAt: new Date().toISOString(),
    });
    await expect(
      f.service.update(admin, initial.id, {
        imei: duplicate,
        brand: 'GPS',
        model: 'Model',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_IMEI' });
    expect(f.equipment.updateMany).not.toHaveBeenCalled();

    f.getEquipment.mockRejectedValue(new Error('Sheets offline'));
    await expect(
      f.service.update(admin, initial.id, {
        imei: '888888888888888',
        brand: 'GPS',
        model: 'Model',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 503, code: 'INVENTORY_IMEI_VERIFICATION_PAUSED' });
    expect(f.equipment.updateMany).not.toHaveBeenCalled();
  });
  it('maps a unique constraint race to a duplicate IMEI conflict', async () => {
    const f = setup();
    f.getEquipment.mockResolvedValue({ data: [], fetchedAt: new Date().toISOString() });
    f.equipment.updateMany.mockRejectedValue({ code: 'P2002' });
    await expect(
      f.service.update(admin, initial.id, {
        imei: '999999999999999',
        brand: 'GPS',
        model: 'Model',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_IMEI' });
    expect(f.audit).not.toHaveBeenCalled();
  });
  it('rejects lifecycle fields in service payloads', async () => {
    const f = setup();
    await expect(
      f.service.update(admin, initial.id, {
        imei: initial.imei,
        brand: 'A',
        model: 'B',
        version: 1,
        state: 'INSTALLED',
      } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.equipment.updateMany).not.toHaveBeenCalled();
  });
  it('reports missing equipment', async () => {
    const f = setup();
    f.equipment.findUnique.mockResolvedValue(null);
    await expect(
      f.service.update(admin, 'missing', {
        imei: initial.imei,
        brand: 'A',
        model: 'B',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(f.service.remove(admin, 'missing', { version: 1 })).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rejects stale edits and deletes', async () => {
    const f = setup();
    await expect(
      f.service.update(admin, initial.id, {
        imei: initial.imei,
        brand: 'A',
        model: 'B',
        version: 2,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(f.service.remove(admin, initial.id, { version: 2 })).rejects.toMatchObject({
      status: 409,
    });
    expect(f.equipment.updateMany).not.toHaveBeenCalled();
    expect(f.equipment.deleteMany).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it('rejects an edit that loses the concurrent version race', async () => {
    const f = setup();
    f.equipment.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      f.service.update(admin, initial.id, {
        imei: initial.imei,
        brand: 'A',
        model: 'B',
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.audit).not.toHaveBeenCalled();
  });
  it.each([{ state: 'INSTALLED' }, { reservedOrderId: 'order' }])(
    'blocks deletion when installed or reserved: %j',
    async (change) => {
      const f = setup();
      f.equipment.findUnique.mockResolvedValue({ ...initial, ...change });
      await expect(f.service.remove(admin, initial.id, { version: 1 })).rejects.toMatchObject({
        status: 409,
        code: 'INVENTORY_EQUIPMENT_IN_USE',
      });
      expect(f.equipment.updateMany).not.toHaveBeenCalled();
      expect(f.audit).not.toHaveBeenCalled();
    },
  );
  it('archives with atomic availability, version and reservation predicates and audit', async () => {
    const f = setup();
    await expect(f.service.remove(admin, initial.id, { version: 1 })).resolves.toEqual({
      deleted: true,
    });
    expect(f.equipment.updateMany).toHaveBeenCalledWith({
      where: {
        id: initial.id,
        version: 1,
        state: 'AVAILABLE',
        reservedOrderId: null,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(f.audit).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ action: 'INVENTORY_EQUIPMENT_DELETED', entityId: initial.id }),
      ],
    });
  });
  it('removes the equipment from draft orders before archiving and audits the removed assignment', async () => {
    const f = setup();
    const assignment = { id: 'assignment-1', inventoryEquipmentId: initial.id, orderUnitId: 'unit-1' };
    f.orderEquipment.findMany.mockResolvedValue([assignment]);

    await expect(f.service.remove(admin, initial.id, { version: 1 })).resolves.toEqual({
      deleted: true,
    });

    expect(f.orderEquipment.findMany).toHaveBeenCalledWith({
      where: { inventoryEquipmentId: initial.id, orderUnit: { order: { status: 'DRAFT' } } },
    });
    expect(f.orderEquipment.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['assignment-1'] },
        orderUnit: { order: { status: 'DRAFT' } },
      },
    });
    expect(f.audit).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          action: 'EQUIPMENT_REMOVED',
          entityType: 'OrderEquipment',
          entityId: 'assignment-1',
        }),
        expect.objectContaining({ action: 'INVENTORY_EQUIPMENT_DELETED', entityId: initial.id }),
      ]),
    });
  });
  it('returns a conflict if archive races a reservation or state change', async () => {
    const f = setup();
    f.equipment.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.remove(admin, initial.id, { version: 1 })).rejects.toMatchObject({
      status: 409,
      code: 'INVENTORY_EQUIPMENT_CONFLICT',
    });
    expect(f.audit).not.toHaveBeenCalled();
  });
});
