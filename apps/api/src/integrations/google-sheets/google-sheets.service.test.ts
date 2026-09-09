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
    values: Readonly<Partial<Record<'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P', string>>>;
  }): Promise<void> {
    const item = this.equipment.find((e) => e.row === input.row);
    if (item) {
      item.values = { ...item.values, ...input.values };
    }
  }

  public async listTechniciansDirectory(): Promise<readonly (readonly string[])[]> {
    return [];
  }

  public async syncTechnicalReportRow(): Promise<{ row: number; created: boolean }> {
    return { row: 2, created: true };
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

describe('DevMockSheetsClient Directory and Report Sync', () => {
  it('reads technicians directory from mock', async () => {
    const { DevMockSheetsClient } = await import('./dev-mock-sheets.client.js');
    const client = new DevMockSheetsClient();
    const rows = await client.listTechniciansDirectory();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]?.[0]).toBe('TECNICO');
    expect(rows[0]?.[22]).toBe('ID_TECNICO');
  });

  it('inserts and updates technical report row preserving D, E, O', async () => {
    const { DevMockSheetsClient } = await import('./dev-mock-sheets.client.js');
    const client = new DevMockSheetsClient();

    // 1. Insert first row
    const insertRes = await client.syncTechnicalReportRow({
      folio: 'OS-TEST-001',
      sem: '37',
      tecnico: 'Juan Perez',
      economico: 'ECO-10',
      serie: 'SER-10',
      imeiId: '861234567890123',
      cliente: 'Flotillas SA',
      fecha: '2026-09-09',
      servicio: 'Instalación',
      costo: '700.00',
      viaticos: '350.00',
      total: '1050.00',
      notas: 'Prueba',
    });

    expect(insertRes.created).toBe(true);
    expect(insertRes.row).toBe(2);

    // Simulate manual entry into D, E, O (which are manual columns!)
    // In DevMockSheetsClient private array:
    const mockRows = (client as unknown as { reportRows: string[][] }).reportRows;
    mockRows[1]![3] = 'Juan Perez Manual'; // D: nombre
    mockRows[1]![4] = 'PEPJ800101XXX'; // E: rfc
    mockRows[1]![14] = 'DHL-TRACK-123'; // O: envio dhl

    // 2. Update existing row with same folio (e.g. correction)
    const updateRes = await client.syncTechnicalReportRow({
      folio: 'OS-TEST-001',
      sem: '37',
      tecnico: 'Juan Perez',
      economico: 'ECO-10-CORREGIDO',
      serie: 'SER-10',
      imeiId: '861234567890123',
      cliente: 'Flotillas SA',
      fecha: '2026-09-09',
      servicio: 'Instalación',
      costo: '700.00',
      viaticos: '350.00',
      total: '1050.00',
      notas: 'Actualizado tras corrección',
    });

    expect(updateRes.created).toBe(false);
    expect(updateRes.row).toBe(2);

    // Verify D, E, O were PRESERVED intact!
    expect(mockRows[1]![3]).toBe('Juan Perez Manual');
    expect(mockRows[1]![4]).toBe('PEPJ800101XXX');
    expect(mockRows[1]![14]).toBe('DHL-TRACK-123');
    // Verify managed columns updated
    expect(mockRows[1]![5]).toBe('ECO-10-CORREGIDO');
    expect(mockRows[1]![15]).toBe('Actualizado tras corrección');
  });

  it('rejects update if duplicate folio exists in sheet', async () => {
    const { DevMockSheetsClient } = await import('./dev-mock-sheets.client.js');
    const { AppError } = await import('../../shared/errors.js');
    const client = new DevMockSheetsClient();

    const mockRows = (client as unknown as { reportRows: string[][] }).reportRows;
    mockRows.push(
      [
        '37',
        'OS-DUP-001',
        'Tech 1',
        '',
        '',
        'E1',
        'S1',
        'I1',
        'C1',
        '2026-09-09',
        'Instalación',
        '100',
        '0',
        '100',
        '',
        '',
      ],
      [
        '37',
        'OS-DUP-001',
        'Tech 2',
        '',
        '',
        'E2',
        'S2',
        'I2',
        'C2',
        '2026-09-09',
        'Instalación',
        '100',
        '0',
        '100',
        '',
        '',
      ],
    );

    await expect(
      client.syncTechnicalReportRow({
        folio: 'OS-DUP-001',
        sem: '37',
        tecnico: 'Tech 1',
        economico: 'E1',
        serie: 'S1',
        imeiId: 'I1',
        cliente: 'C1',
        fecha: '2026-09-09',
        servicio: 'Instalación',
        costo: '100.00',
        viaticos: '0.00',
        total: '100.00',
        notas: '',
      }),
    ).rejects.toThrow(AppError);
  });

  it('inserts each new order at row 2 and shifts previous rows down', async () => {
    const { DevMockSheetsClient } = await import('./dev-mock-sheets.client.js');
    const client = new DevMockSheetsClient();
    const mockRows = (client as unknown as { reportRows: string[][] }).reportRows;

    // First insert
    const res1 = await client.syncTechnicalReportRow({
      folio: 'OS-FIRST',
      sem: '37',
      tecnico: 'Tech A',
      economico: 'ECO-A',
      serie: 'SER-A',
      imeiId: 'IMEI-A',
      cliente: 'Client A',
      fecha: '2026-09-09',
      servicio: 'Instalación',
      costo: '500.00',
      viaticos: '0.00',
      total: '500.00',
      notas: 'First order',
    });
    expect(res1.created).toBe(true);
    expect(res1.row).toBe(2);
    expect(mockRows[1]![1]).toBe('OS-FIRST');

    // Second insert: must be inserted at row 2, pushing OS-FIRST to row 3
    const res2 = await client.syncTechnicalReportRow({
      folio: 'OS-SECOND',
      sem: '37',
      tecnico: 'Tech B',
      economico: 'ECO-B',
      serie: 'SER-B',
      imeiId: 'IMEI-B',
      cliente: 'Client B',
      fecha: '2026-09-09',
      servicio: 'Revisión',
      costo: '300.00',
      viaticos: '100.00',
      total: '400.00',
      notas: 'Second order',
    });
    expect(res2.created).toBe(true);
    expect(res2.row).toBe(2);
    expect(mockRows[1]![1]).toBe('OS-SECOND'); // at row 2 (index 1)
    expect(mockRows[2]![1]).toBe('OS-FIRST'); // shifted to row 3 (index 2)

    // Updating OS-FIRST should update row 3 in-place, NOT row 2
    const updateRes = await client.syncTechnicalReportRow({
      folio: 'OS-FIRST',
      sem: '37',
      tecnico: 'Tech A',
      economico: 'ECO-A-UPDATED',
      serie: 'SER-A',
      imeiId: 'IMEI-A',
      cliente: 'Client A',
      fecha: '2026-09-09',
      servicio: 'Instalación',
      costo: '500.00',
      viaticos: '0.00',
      total: '500.00',
      notas: 'First order updated',
    });
    expect(updateRes.created).toBe(false);
    expect(updateRes.row).toBe(3);
    expect(mockRows[2]![1]).toBe('OS-FIRST');
    expect(mockRows[2]![5]).toBe('ECO-A-UPDATED');
    expect(mockRows[1]![1]).toBe('OS-SECOND'); // row 2 remains OS-SECOND
  });
});
