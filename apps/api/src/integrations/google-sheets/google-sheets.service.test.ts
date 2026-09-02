import { describe, expect, it, vi } from 'vitest';
import type { ExternalClientRecord, ExternalEquipmentRecord, SheetsPort } from '../ports.js';
import { GoogleSheetsCatalogService } from './google-sheets.service.js';

class MockSheetsPort implements SheetsPort {
  public clients: ExternalClientRecord[] = [
    { externalId: 'CLI-1', name: 'Transportes del Norte' },
    { externalId: 'CLI-2', name: 'Logistica Express' },
  ];

  public equipment: ExternalEquipmentRecord[] = [
    {
      externalId: 'EQ-101',
      imei: '861234567890123',
      row: 2,
      values: {
        A: '2026-01-01',
        B: 'Teltonika',
        C: 'FMB920',
        D: 'EQ-101',
        E: '861234567890123',
        F: '5511223344',
        G: '8952000001',
        H: 'Telcel',
        I: 'NUEVO',
        J: '',
        K: 'STOCK TECNICO',
        L: '',
        M: '',
        N: '',
        O: '',
        P: '',
      },
    },
    {
      externalId: '',
      imei: '869999999999999',
      row: 3,
      values: {
        A: '2026-01-02',
        B: 'Queclink',
        C: 'GV55',
        D: 'PENDIENTE',
        E: '869999999999999',
        F: '',
        G: '',
        H: 'AT&T',
        I: 'USADO',
        J: '',
        K: 'STOCK',
        L: '',
        M: '',
        N: '',
        O: '',
        P: '',
      },
    },
  ];

  public async listClients(): Promise<readonly ExternalClientRecord[]> {
    return this.clients;
  }

  public async listEquipment(): Promise<readonly ExternalEquipmentRecord[]> {
    return this.equipment;
  }

  public async findEquipment(identity: {
    externalId: string;
    imei: string;
  }): Promise<ExternalEquipmentRecord | null> {
    return (
      this.equipment.find(
        (e) =>
          (identity.externalId && e.externalId === identity.externalId) ||
          (identity.imei && e.imei === identity.imei),
      ) ?? null
    );
  }

  public async updateAssignment(input: {
    row: number;
    values: Readonly<Partial<Record<'J' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    const item = this.equipment.find((e) => e.row === input.row);
    if (item) {
      item.values = { ...item.values, ...input.values };
    }
  }
}

describe('GoogleSheetsCatalogService', () => {
  it('caches clients and reuses cache until expired or invalidated', async () => {
    const port = new MockSheetsPort();
    const listSpy = vi.spyOn(port, 'listClients');
    const service = new GoogleSheetsCatalogService(port, 10); // 10s TTL

    const res1 = await service.getClients();
    expect(res1.data).toHaveLength(2);
    expect(listSpy).toHaveBeenCalledTimes(1);

    const res2 = await service.getClients();
    expect(res2.data).toHaveLength(2);
    expect(listSpy).toHaveBeenCalledTimes(1); // Cached!

    // Invalidate manually
    service.invalidateCache();
    const res3 = await service.getClients();
    expect(res3.data).toHaveLength(2);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('filters clients and equipment by search query', async () => {
    const port = new MockSheetsPort();
    const service = new GoogleSheetsCatalogService(port, 60);

    const clients = await service.getClients({ search: 'Norte' });
    expect(clients.data).toHaveLength(1);
    expect(clients.data[0]?.name).toBe('Transportes del Norte');

    const equipment = await service.getEquipment({ search: 'Queclink' });
    expect(equipment.data).toHaveLength(1);
    expect(equipment.data[0]?.brand).toBe('Queclink');
  });

  it('correctly identifies equipment by externalKey even when rows move', async () => {
    const port = new MockSheetsPort();
    const service = new GoogleSheetsCatalogService(port, 60);

    const found = await service.findEquipmentByKey('EQ-101');
    expect(found.equipment).not.toBeNull();
    expect(found.equipment?.brand).toBe('Teltonika');

    // Simulate rows moving in sheet
    port.equipment[0]!.row = 15;
    service.invalidateCache();

    const moved = await service.findEquipmentByKey('EQ-101');
    expect(moved.equipment?.rowNumber).toBe(15);
  });
});
