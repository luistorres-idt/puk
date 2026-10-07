import { describe, expect, it, vi } from 'vitest';
import type { RegisterEquipment } from '@puk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { EquipmentCatalogPort } from '../../integrations/ports.js';
import { InventoryService } from './inventory.service.js';

const input: RegisterEquipment = {
  registrationKey: '11111111-1111-4111-8111-111111111111',
  brand: 'GPS',
  model: 'Model',
  imei: '123456789012345',
  serviceType: 'INSTALLATION',
  clientSheetId: 'C1',
  clientName: 'Client',
};
const admin = { id: 'admin', role: 'ADMIN' as const };
function setup() {
  const findUnique = vi.fn().mockResolvedValue(null);
  const create = vi.fn(async ({ data }) => ({
    currentClientSheetId: null,
    currentClientName: null,
    unitLabel: null,
    unitMakeModel: null,
    unitSerialNumber: null,
    unitYear: null,
    reservedOrderId: null,
    ...data,
  }));
  const audit = vi.fn();
  const transaction = vi.fn(async (callback) =>
    callback({ equipment: { create }, auditLog: { createMany: audit } }),
  );
  const getEquipment = vi.fn().mockResolvedValue({ data: [], fetchedAt: new Date().toISOString() });
  const service = new InventoryService(
    { equipment: { findUnique }, $transaction: transaction } as unknown as PrismaClient,
    { getEquipment } as EquipmentCatalogPort,
  );
  return { service, findUnique, create, transaction, audit, getEquipment };
}
describe('InventoryService', () => {
  it('enforces ADMIN before any catalog or DB access', async () => {
    const f = setup();
    await expect(f.service.register({ ...admin, role: 'TECHNICIAN' }, input)).rejects.toMatchObject(
      { status: 403 },
    );
    expect(f.findUnique).not.toHaveBeenCalled();
    expect(f.getEquipment).not.toHaveBeenCalled();
  });
  it('rejects invalid fields at service boundary', async () => {
    const f = setup();
    await expect(f.service.register(admin, { ...input, brand: ' ' })).rejects.toMatchObject({
      status: 400,
    });
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('persists independently and audits without sheet writes', async () => {
    const f = setup();
    const result = await f.service.register(admin, input);
    expect(result).toMatchObject({ source: 'DB', serviceStatus: 'DISPONIBLE', imei: input.imei });
    expect(f.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        registrationKey: input.registrationKey,
        state: 'AVAILABLE',
        createdById: admin.id,
      }),
    });
    expect(f.audit).toHaveBeenCalledOnce();
    expect(f.getEquipment).toHaveBeenCalledWith({ forceFresh: true });
  });
  it('persists real installed client and unit before any order exists', async () => {
    const f = setup();
    await f.service.register(admin, {
      ...input,
      serviceType: 'REVIEW',
      unit: { label: 'Truck', makeModel: 'Model', serialNumber: 'VIN' },
    });
    expect(f.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        state: 'INSTALLED',
        currentClientSheetId: 'C1',
        currentClientName: 'Client',
        unitLabel: 'Truck',
        unitSerialNumber: 'VIN',
      }),
    });
  });
  it('blocks duplicate legacy IMEI with an existing-record selection identity', async () => {
    const f = setup();
    f.getEquipment.mockResolvedValue({
      data: [{ externalKey: 'EQ-1', imei: input.imei }],
      fetchedAt: '',
    });
    await expect(f.service.register(admin, input)).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_IMEI',
      details: { existingKeys: ['EQ-1'] },
    });
    expect(f.create).not.toHaveBeenCalled();
  });
  it('blocks registration on source outage without committing', async () => {
    const f = setup();
    f.getEquipment.mockRejectedValue(new Error('offline'));
    await expect(f.service.register(admin, input)).rejects.toMatchObject({
      status: 503,
      code: 'INVENTORY_REGISTRATION_PAUSED',
    });
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('returns a committed registration on lost-response retry even when Sheets is now offline', async () => {
    const f = setup();
    await f.service.register(admin, input);
    const data = f.create.mock.calls[0]![0].data;
    f.findUnique.mockResolvedValue({ ...data, unitYear: null });
    f.getEquipment.mockRejectedValue(new Error('offline'));
    await expect(f.service.register(admin, input)).resolves.toMatchObject({
      source: 'DB',
      imei: input.imei,
    });
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.getEquipment).toHaveBeenCalledOnce();
  });
  it('rejects reuse of a registration key with changed data', async () => {
    const f = setup();
    f.findUnique.mockResolvedValue({ createdById: admin.id, registrationHash: 'different' });
    await expect(f.service.register(admin, input)).rejects.toMatchObject({
      code: 'REGISTRATION_KEY_REUSED',
    });
  });
});
