import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { SheetsPort } from '../../integrations/ports.js';
import { TechniciansService } from './technicians.service.js';

describe('technician selection', () => {
  it('restricts selection to active technicians and projects only selector fields', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new TechniciansService({ technician: { findMany } } as unknown as PrismaClient);
    await service.listSelectable();
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: {
        id: true,
        name: true,
        workshop: true,
        city: true,
        state: true,
        phone: true,
        externalKey: true,
      },
      orderBy: { name: 'asc' },
    });
  });

  it('synchronizes technicians from sheets on listSelectable when sheetsPort is provided', async () => {
    const validHeaderRow = [
      'TECNICO', 'TALLER', 'RAZON SOCIAL', 'TELEFONO', 'CORREO', 'DIRECCIÓN',
      'CIUDAD', 'ESTADO', 'FACTURA', 'DATOS FISCALES', 'DIRECCION FISCAL',
      'COSTO SALIDA DEL TALLER', 'CAMBIO DE EQUIPO', 'INSTALACION', 'REVISION',
      'DESINSTALACION', 'CITA FALLIDA', 'SENSOR FUEL', 'NOTAS ADICIONALES',
      'NOMBRE DE LA CUENTA BANCARIA', 'CUENTA BANCARIA', 'BANCO', 'ID_TECNICO',
    ];
    const mockSheetsPort = {
      listTechniciansDirectory: vi.fn().mockResolvedValue([
        validHeaderRow,
        [
          'Ana Gomez', 'Taller Sur', '', '6620000000', '',
          '', 'Hermosillo', 'Sonora', '', '', '',
          '', '', '', '', '', '', '', '', '', '', '', 'TEC-0001',
        ],
      ]),
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const mockPrisma = {
      technician: { findMany, findUnique, create, updateMany },
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
    } as unknown as PrismaClient;

    const service = new TechniciansService(mockPrisma, mockSheetsPort as unknown as SheetsPort);
    await service.listSelectable();

    expect(mockSheetsPort.listTechniciansDirectory).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Ana Gomez',
          externalKey: 'TEC-0001',
        }),
      }),
    );
    expect(findMany).toHaveBeenCalled();
  });

  it('falls back to local database technicians if sheetsPort fails during listSelectable', async () => {
    const mockSheetsPort = {
      listTechniciansDirectory: vi.fn().mockRejectedValue(new Error('Google Sheets API unavailable')),
    };
    const fallbackTechs = [{ id: 'tech-fallback', name: 'Tecnico Local', workshop: 'Taller', city: 'Ciudad' }];
    const findMany = vi.fn().mockResolvedValue(fallbackTechs);
    const mockPrisma = {
      technician: { findMany },
    } as unknown as PrismaClient;

    const service = new TechniciansService(mockPrisma, mockSheetsPort as unknown as SheetsPort);
    const result = await service.listSelectable();

    expect(result).toEqual(fallbackTechs);
    expect(findMany).toHaveBeenCalled();
  });

  it('allocates next durable ID when creating technician without externalKey', async () => {
    const existing = [{ externalKey: 'TEC-0001' }, { externalKey: 'TEC-0088' }];
    const findMany = vi.fn().mockResolvedValue(existing);
    const create = vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'uuid-1', ...data }));
    const auditCreate = vi.fn().mockResolvedValue({});

    const mockPrisma = {
      technician: { findMany, create },
      auditLog: { create: auditCreate },
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
    } as unknown as PrismaClient;

    const service = new TechniciansService(mockPrisma);
    const created = await service.create('admin-1', {
      name: 'Nuevo Tecnico',
      workshop: 'Taller Nuevo',
    });

    expect(created.externalKey).toBe('TEC-0089');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalKey: 'TEC-0089',
          name: 'Nuevo Tecnico',
        }),
      }),
    );
  });

  it('synchronizes technicians from sheets idempotently and deactivates retired ones', async () => {
    const validHeaderRow = [
      'TECNICO', 'TALLER', 'RAZON SOCIAL', 'TELEFONO', 'CORREO', 'DIRECCIÓN',
      'CIUDAD', 'ESTADO', 'FACTURA', 'DATOS FISCALES', 'DIRECCION FISCAL',
      'COSTO SALIDA DEL TALLER', 'CAMBIO DE EQUIPO', 'INSTALACION', 'REVISION',
      'DESINSTALACION', 'CITA FALLIDA', 'SENSOR FUEL', 'NOTAS ADICIONALES',
      'NOMBRE DE LA CUENTA BANCARIA', 'CUENTA BANCARIA', 'BANCO', 'ID_TECNICO',
    ];

    const mockSheetsPort = {
      listTechniciansDirectory: vi.fn().mockResolvedValue([
        validHeaderRow,
        [
          'Juan Perez', 'Taller Central', 'Juan SA', '6621234567', 'juan@test.com',
          'Calle 1', 'Hermosillo', 'Sonora', 'SI', 'PEPJ', 'Dir 1',
          '$350.00', '$500.00', '$700.00', '$400.00', '$450.00', '$250.00', '$600.00',
          'Notas', '', '', '', 'TEC-0001',
        ],
      ]),
    };

    const existingTech = {
      id: 'existing-uuid-1',
      externalKey: 'TEC-0001',
      name: 'Juan Perez Anterior',
    };

    const findUnique = vi.fn().mockImplementation(({ where }) => {
      if (where.externalKey === 'TEC-0001') return Promise.resolve(existingTech);
      return Promise.resolve(null);
    });
    const update = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 }); // 1 retired technician
    const auditCreate = vi.fn().mockResolvedValue({});

    const mockPrisma = {
      technician: { findUnique, update, create, updateMany },
      auditLog: { create: auditCreate },
      $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
    } as unknown as PrismaClient;

    const service = new TechniciansService(mockPrisma, mockSheetsPort as unknown as SheetsPort);
    const result = await service.syncFromSheets('admin-1');

    expect(result.synced).toBe(1);
    expect(result.deactivated).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-uuid-1' },
        data: expect.objectContaining({
          name: 'Juan Perez',
          active: true,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        externalKey: { notIn: ['TEC-0001'], not: null },
        active: true,
      },
      data: { active: false },
    });
  });
});
