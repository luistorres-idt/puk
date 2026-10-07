import { describe, expect, it, vi } from 'vitest';
import type { ExternalEquipment } from '@puk/contracts';
import type { PrismaClient, Equipment } from '../../generated/prisma/client.js';
import type { CatalogServicePort } from '../../integrations/ports.js';
import {
  combineEquipment,
  HybridEquipmentCatalog,
  toCatalogEquipment,
} from './equipment-catalog.js';

const equipment = (
  source: 'DB' | 'SHEETS',
  patch: Partial<ExternalEquipment> = {},
): ExternalEquipment => ({
  source,
  externalKey: source === 'DB' ? 'DB:1' : 'EQ-1',
  id: '1',
  imei: '123456789012345',
  brand: 'GPS',
  model: 'Model',
  line: null,
  iccid: null,
  carrier: null,
  condition: null,
  currentClient: null,
  serviceStatus: 'DISPONIBLE',
  unit: null,
  unitMakeModel: null,
  unitYear: null,
  unitSerialNumber: null,
  serviceType: null,
  rowNumber: 2,
  hasValidIdentity: true,
  rawValues: {},
  ...patch,
});
describe('hybrid equipment identity', () => {
  it('combines sources without altering unrelated or incomplete legacy rows', () => {
    const legacy = equipment('SHEETS', { imei: null, externalKey: 'legacy' });
    expect(
      combineEquipment([equipment('DB')], [equipment('SHEETS', { imei: 'different' }), legacy])
        .data,
    ).toHaveLength(3);
  });
  it('offers one canonical DB choice for physically compatible cross-source copies without rewriting records', () => {
    const db = equipment('DB');
    const sheets = equipment('SHEETS');
    expect(combineEquipment([db], [sheets])).toEqual({ data: [db], conflicts: false });
    expect(sheets.externalKey).toBe('EQ-1');
  });
  it.each([
    { serviceStatus: 'INSTALADO', currentClient: 'Another client' },
    { currentClient: 'Another client' },
  ])('blocks contradictory later copies %o', (patch) => {
    const result = combineEquipment([equipment('DB')], [equipment('SHEETS', patch)]);
    expect(result.conflicts).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data.every((e) => e.identityConflict && !e.hasValidIdentity)).toBe(true);
  });
  it('fails closed for ambiguous multiple legacy IMEI rows', () =>
    expect(
      combineEquipment([], [equipment('SHEETS'), equipment('SHEETS', { externalKey: 'EQ-2' })])
        .conflicts,
    ).toBe(true));
  it('serves uncached DB inventory when Sheets is unavailable and pauses new registration', async () => {
    const db = {
      id: 'local',
      imei: '123456789012345',
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
    } as Equipment;
    const findMany = vi.fn().mockResolvedValue([db]);
    const sheets = {
      getEquipment: vi.fn().mockRejectedValue(new Error('offline')),
      invalidateCache: vi.fn(),
    } as unknown as CatalogServicePort;
    const service = new HybridEquipmentCatalog(
      { equipment: { findMany } } as unknown as PrismaClient,
      sheets,
    );
    const result = await service.getEquipment({ search: 'gps' });
    expect(result).toMatchObject({
      registrationAllowed: false,
      sheetsAvailable: false,
      data: [toCatalogEquipment(db)],
    });
    expect(result.warnings).toHaveLength(1);
    findMany.mockResolvedValue([]);
    expect((await service.getEquipment()).data).toEqual([]);
  });
});

it('does not collapse matching names with conflicting stable client IDs', () => {
  const result = combineEquipment(
    [
      equipment('DB', {
        serviceStatus: 'INSTALADO',
        currentClient: 'Client',
        currentClientSheetId: 'C1',
      }),
    ],
    [
      equipment('SHEETS', {
        serviceStatus: 'INSTALADO',
        currentClient: 'Client',
        currentClientSheetId: 'C2',
      }),
    ],
  );
  expect(result.conflicts).toBe(true);
});
