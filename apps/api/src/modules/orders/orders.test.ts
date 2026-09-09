import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrderServiceTypeSchema, type ExternalEquipment } from '@puk/contracts';
import { OrdersService } from './orders.service.js';
import { SyncService } from './sync.service.js';
import { GoogleSheetsCatalogService } from '../../integrations/google-sheets/google-sheets.service.js';
import type { SheetsPort } from '../../integrations/ports.js';
import { OrderStatus, SyncStatus, type PrismaClient } from '../../generated/prisma/client.js';

class MockSheetsPort implements SheetsPort {
  public async listClients() {
    return [{ externalId: 'CLI-1', name: 'Transportes Bull Dog' }];
  }
  public async listEquipment() {
    return [
      {
        externalId: 'EQ-001',
        imei: '861234567890123',
        row: 2,
        values: {
          A: '2026-01-01',
          B: 'Teltonika',
          C: 'FMB920',
          D: 'EQ-001',
          E: '861234567890123',
          F: '',
          G: '',
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
    ];
  }
  public async findEquipment(identity: { externalId: string; imei: string }) {
    const list = await this.listEquipment();
    return list.find((e) => e.externalId === identity.externalId) ?? null;
  }
  public async updateAssignment(): Promise<void> {}
  public async listTechniciansDirectory(): Promise<readonly (readonly string[])[]> {
    return [];
  }
  public async syncTechnicalReportRow(): Promise<{ row: number; created: boolean }> {
    return { row: 2, created: true };
  }
}

interface MockDatabase {
  $transaction: ReturnType<typeof vi.fn>;
  order: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  orderUnit: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  orderEquipment: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  technician: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  sheetSyncOperation: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
}

describe('OrdersService & SyncService', () => {
  let mockPrisma: MockDatabase;
  let sheetsPort: MockSheetsPort;
  let catalogService: GoogleSheetsCatalogService;
  let ordersService: OrdersService;
  let syncService: SyncService;

  beforeEach(() => {
    sheetsPort = new MockSheetsPort();
    catalogService = new GoogleSheetsCatalogService(sheetsPort, 60);

    mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          order: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
              id: 'order-1',
              ...data,
            })),
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => ({ id: where.id, ...data }),
            ),
            findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({
              id: where.id,
              version: 2,
            })),
          },
          orderUnit: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
              id: 'unit-1',
              ...data,
            })),
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => ({ id: where.id, ...data }),
            ),
            delete: vi.fn(),
          },
          orderEquipment: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
              id: 'eq-1',
              ...data,
            })),
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => ({ id: where.id, ...data }),
            ),
            delete: vi.fn(),
          },
          auditLog: {
            createMany: vi.fn(),
          },
          sheetSyncOperation: {
            createMany: vi.fn(),
          },
        };
        return callback(tx);
      }),
      order: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      orderUnit: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      orderEquipment: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      technician: {
        findUnique: vi.fn(),
      },
      sheetSyncOperation: {
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    ordersService = new OrdersService(mockPrisma as unknown as PrismaClient, catalogService);
    syncService = new SyncService(mockPrisma as unknown as PrismaClient, sheetsPort);
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1', active: true });
  });

  it('creates an order in DRAFT status with folio and version 1', async () => {
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1', active: true });

    const result = await ordersService.createOrder('user-admin-1', {
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      serviceType: 'INSTALLATION',
      scheduledAt: new Date().toISOString(),
      technicianId: 'tech-1',
    });

    expect(result.id).toBe('order-1');
    expect(result.status).toBe(OrderStatus.DRAFT);
    expect(result.folio).toMatch(/^OS-/);
    expect(result.version).toBe(1);
    expect(result.technicianId).toBe('tech-1');
  });

  it('creates an order with units and equipment atomically', async () => {
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1', active: true });
    mockPrisma.orderEquipment.findFirst.mockResolvedValue(null);

    const result = await ordersService.createOrder('user-admin-1', {
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      serviceType: 'INSTALLATION',
      scheduledAt: new Date().toISOString(),
      technicianId: 'tech-1',
      units: [
        {
          label: 'Eco-101',
          makeModel: 'Kenworth T680',
          serialNumber: 'SERIAL-101',
          year: 2023,
          equipment: [
            {
              externalKey: 'EQ-001',
              externalId: 'EQ-001',
              imei: '861234567890123',
            },
          ],
        },
      ],
    });

    expect(result.id).toBe('order-1');
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('rejects order creation if units have duplicate serial numbers', async () => {
    await expect(
      ordersService.createOrder('user-admin-1', {
        clientSheetId: 'CLI-1',
        clientNameSnapshot: 'Transportes Bull Dog',
        serviceType: 'INSTALLATION',
        scheduledAt: new Date().toISOString(),
        technicianId: 'tech-1',
        units: [
          {
            label: 'Eco-101',
            makeModel: 'Kenworth T680',
            serialNumber: 'DUPLICATE-SN',
          },
          {
            label: 'Eco-102',
            makeModel: 'Kenworth T680',
            serialNumber: 'DUPLICATE-SN',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_SERIAL_NUMBER',
    });
  });

  it('rejects order creation if equipment is already active elsewhere', async () => {
    mockPrisma.orderEquipment.findFirst.mockResolvedValue({
      id: 'active-eq',
      externalKey: 'EQ-ALREADY-ACTIVE',
      activeAssignment: true,
    });

    await expect(
      ordersService.createOrder('user-admin-1', {
        clientSheetId: 'CLI-1',
        clientNameSnapshot: 'Transportes Bull Dog',
        serviceType: 'INSTALLATION',
        scheduledAt: new Date().toISOString(),
        technicianId: 'tech-1',
        units: [
          {
            label: 'Eco-101',
            makeModel: 'Kenworth T680',
            serialNumber: 'SERIAL-101',
            equipment: [
              {
                externalKey: 'EQ-ALREADY-ACTIVE',
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
    });
  });

  it('prevents adding a unit with duplicate serial number in the same order', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      serviceType: 'INSTALLATION',
    });
    mockPrisma.orderUnit.findUnique.mockResolvedValue({
      id: 'existing-unit',
      serialNumber: 'SERIAL-123',
    });

    await expect(
      ordersService.addUnit('user-admin-1', 'order-1', {
        label: 'Camion 1',
        makeModel: 'Kenworth T680',
        serialNumber: 'SERIAL-123',
        year: 2022,
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_SERIAL_NUMBER',
    });
  });

  it('prevents assigning equipment actively assigned to another order', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      serviceType: 'INSTALLATION',
    });
    mockPrisma.orderUnit.findUnique.mockResolvedValue({
      id: 'unit-1',
      orderId: 'order-1',
    });
    mockPrisma.orderEquipment.findFirst.mockResolvedValue({
      id: 'other-eq',
      externalKey: 'EQ-001',
      activeAssignment: true,
    });

    await expect(
      ordersService.assignEquipment('user-admin-1', 'order-1', 'unit-1', {
        externalKey: 'EQ-001',
      }),
    ).rejects.toMatchObject({
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
    });
  });

  it('detects Sheets row conflicts and assigns order with sync outbox operations', async () => {
    const orderData = {
      id: 'order-1',
      status: OrderStatus.DRAFT,
      serviceType: 'INSTALLATION',
      technicianId: 'tech-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      version: 1,
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          makeModel: 'Freightliner',
          year: 2023,
          serialNumber: 'SN-001',
          equipment: [
            {
              id: 'eq-1',
              externalKey: 'EQ-001',
              sheetRowHint: 2,
              activeAssignment: false,
            },
          ],
        },
      ],
    };

    mockPrisma.order.findUnique.mockResolvedValue(orderData);
    mockPrisma.orderEquipment.findFirst.mockResolvedValue(null);

    const result = await ordersService.assignAndSyncOrder('user-admin-1', 'order-1');
    expect(result.status).toBe(OrderStatus.ASSIGNED);
  });

  it('allows assignment when equipment already belongs to the same client with casing/suffix variation', async () => {
    // Mock Sheets to return equipment with client variation
    vi.spyOn(sheetsPort, 'listEquipment').mockResolvedValueOnce([
      {
        externalId: 'EQ-001',
        imei: '861234567890123',
        row: 2,
        values: {
          A: '2026-01-01',
          B: 'Teltonika',
          C: 'FMB920',
          D: 'EQ-001',
          E: '861234567890123',
          F: '',
          G: '',
          H: 'Telcel',
          I: 'USADO',
          J: 'TRANSPORTES BULL DOG S.A. DE C.V.',
          K: 'INSTALADO',
          L: 'Eco-01',
          M: 'Kenworth',
          N: '2022',
          O: 'SN-001',
          P: '',
        },
      },
    ]);

    const orderData = {
      id: 'order-1',
      status: OrderStatus.DRAFT,
      technicianId: 'tech-1',
      clientSheetId: 'CLI-1',
      serviceType: 'INSTALLATION',
      clientNameSnapshot: 'Transportes Bull Dog',
      version: 1,
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          makeModel: 'Freightliner',
          year: 2023,
          serialNumber: 'SN-001',
          equipment: [
            {
              id: 'eq-1',
              externalKey: 'EQ-001',
              sheetRowHint: 2,
              activeAssignment: false,
            },
          ],
        },
      ],
    };

    mockPrisma.order.findUnique.mockResolvedValue(orderData);
    mockPrisma.orderEquipment.findFirst.mockResolvedValue(null);

    const result = await ordersService.assignAndSyncOrder('user-admin-1', 'order-1', {
      forceFresh: true,
    });
    expect(result.status).toBe(OrderStatus.ASSIGNED);
  });

  it('rejects assignment with SHEET_ROW_CONFLICT when equipment in Sheets belongs to a different client', async () => {
    vi.spyOn(sheetsPort, 'listEquipment').mockResolvedValueOnce([
      {
        externalId: 'EQ-001',
        imei: '861234567890123',
        row: 2,
        values: {
          A: '2026-01-01',
          B: 'Teltonika',
          C: 'FMB920',
          D: 'EQ-001',
          E: '861234567890123',
          F: '',
          G: '',
          H: 'Telcel',
          I: 'USADO',
          J: 'Flotillas Azteca',
          K: 'INSTALADO',
          L: 'Eco-99',
          M: 'Kenworth',
          N: '2022',
          O: 'SN-999',
          P: '',
        },
      },
    ]);

    const orderData = {
      id: 'order-1',
      status: OrderStatus.DRAFT,
      technicianId: 'tech-1',
      clientSheetId: 'CLI-1',
      serviceType: 'INSTALLATION',
      clientNameSnapshot: 'Transportes Bull Dog',
      version: 1,
      units: [
        {
          id: 'unit-1',
          label: 'Unidad 01',
          makeModel: 'Freightliner',
          year: 2023,
          serialNumber: 'SN-001',
          equipment: [
            {
              id: 'eq-1',
              externalKey: 'EQ-001',
              sheetRowHint: 2,
              activeAssignment: false,
            },
          ],
        },
      ],
    };

    mockPrisma.order.findUnique.mockResolvedValue(orderData);
    mockPrisma.orderEquipment.findFirst.mockResolvedValue(null);

    await expect(
      ordersService.assignAndSyncOrder('user-admin-1', 'order-1', { forceFresh: true }),
    ).rejects.toMatchObject({
      code: 'SHEET_ROW_CONFLICT',
    });
  });

  it('processes pending sync operations and updates Sheets via SyncService', async () => {
    const updateSpy = vi.spyOn(sheetsPort, 'updateAssignment');
    mockPrisma.sheetSyncOperation.findMany.mockResolvedValue([
      {
        id: 'op-1',
        status: SyncStatus.PENDING,
        attempts: 0,
        payload: {
          externalKey: 'EQ-001',
          row: 2,
          values: {
            J: 'Transportes Bull Dog',
            L: 'Unidad 01',
            M: 'Freightliner',
            N: '2023',
            O: 'SN-001',
          },
        },
      },
    ]);

    const processed = await syncService.processPendingOperations();
    expect(processed).toBe(1);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        row: 2,
        values: expect.objectContaining({
          J: 'Transportes Bull Dog',
          L: 'Unidad 01',
        }),
      }),
    );
  });

  it('processes SHEET_TECHNICAL_REPORT operations and calls syncTechnicalReportRow via SyncService', async () => {
    const reportSpy = vi.spyOn(sheetsPort, 'syncTechnicalReportRow');
    mockPrisma.sheetSyncOperation.findMany.mockResolvedValue([
      {
        id: 'op-report-1',
        operationType: 'SHEET_TECHNICAL_REPORT',
        status: SyncStatus.PENDING,
        attempts: 0,
        payload: {
          folio: 'OS-001',
          sem: '37',
          tecnico: 'Juan Perez',
          economico: 'ECO-01',
          serie: 'SN-01',
          imeiId: '861234567890123',
          cliente: 'Transportes Bull Dog',
          fecha: '2026-09-09',
          servicio: 'Instalación',
          costo: '700.00',
          viaticos: '350.00',
          total: '1050.00',
          notas: '',
        },
      },
    ]);

    const processed = await syncService.processPendingOperations();
    expect(processed).toBe(1);
    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        folio: 'OS-001',
        tecnico: 'Juan Perez',
        total: '1050.00',
      }),
    );
  });

  it('enqueues correct outbox values for UNINSTALLATION and EQUIPMENT_REPLACEMENT on assignAndSyncOrder', async () => {
    mockPrisma.orderEquipment.findFirst.mockResolvedValue(null);
    vi.spyOn(catalogService, 'getEquipment').mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      data: [
        { externalKey: 'EQ-001', hasValidIdentity: true, currentClient: 'Transportes Bull Dog' } as unknown as ExternalEquipment,
        { externalKey: 'EQ-OLD', hasValidIdentity: true, currentClient: 'Transportes Bull Dog' } as unknown as ExternalEquipment,
        { externalKey: 'EQ-NEW', hasValidIdentity: true, currentClient: 'Transportes Bull Dog' } as unknown as ExternalEquipment,
      ],
    });

    // Test UNINSTALLATION
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-uninst',
      status: OrderStatus.DRAFT,
      serviceType: 'UNINSTALLATION',
      technicianId: 'tech-1',
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      version: 1,
      units: [
        {
          id: 'unit-1',
          label: 'Eco-01',
          makeModel: 'Kenworth',
          year: 2022,
          serialNumber: 'SN-999',
          equipment: [
            {
              id: 'eq-1',
              externalKey: 'EQ-001',
              sheetRowHint: 2,
              activeAssignment: false,
            },
          ],
        },
      ],
    });

    let enqueuedOps: Array<{ operationType: string; payload: { values: Record<string, string> } }> = [];
    mockPrisma.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        orderEquipment: { update: vi.fn() },
        order: { update: vi.fn().mockResolvedValue({ id: 'order-uninst', status: 'ASSIGNED' }) },
        auditLog: { createMany: vi.fn() },
        sheetSyncOperation: {
          createMany: vi.fn(({ data }: { data: typeof enqueuedOps }) => {
            enqueuedOps = data;
          }),
        },
      };
      return callback(tx);
    });

    await ordersService.assignAndSyncOrder('admin', 'order-uninst');
    expect(enqueuedOps).toHaveLength(1);
    expect(enqueuedOps[0]?.operationType).toBe('SHEET_EQUIPMENT_ASSIGNMENT');
    expect(enqueuedOps[0]?.payload.values).toEqual({
      K: 'STOCK TECNICO',
      L: '',
      M: '',
      N: '',
      O: '',
    });

    // Test EQUIPMENT_REPLACEMENT
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-replace',
      status: OrderStatus.DRAFT,
      serviceType: 'EQUIPMENT_REPLACEMENT',
      technicianId: 'tech-1',
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      version: 1,
      units: [
        {
          id: 'unit-1',
          label: 'Eco-01',
          makeModel: 'Kenworth',
          year: 2022,
          serialNumber: 'SN-999',
          equipment: [
            {
              id: 'eq-old',
              externalKey: 'EQ-OLD',
              sheetRowHint: 2,
              serviceStatusSnapshot: 'INSTALADO',
              activeAssignment: false,
            },
            {
              id: 'eq-new',
              externalKey: 'EQ-NEW',
              sheetRowHint: 3,
              serviceStatusSnapshot: 'STOCK TECNICO',
              activeAssignment: false,
            },
          ],
        },
      ],
    });

    mockPrisma.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        orderEquipment: { update: vi.fn() },
        order: { update: vi.fn().mockResolvedValue({ id: 'order-replace', status: 'ASSIGNED' }) },
        auditLog: { createMany: vi.fn() },
        sheetSyncOperation: {
          createMany: vi.fn(({ data }: { data: typeof enqueuedOps }) => {
            enqueuedOps = data;
          }),
        },
      };
      return callback(tx);
    });

    await ordersService.assignAndSyncOrder('admin', 'order-replace');
    expect(enqueuedOps).toHaveLength(2);
    // Old equipment retired to STOCK TECNICO
    expect(enqueuedOps[0]?.payload.values).toEqual({
      K: 'STOCK TECNICO',
      L: '',
      M: '',
      N: '',
      O: '',
    });
    // New equipment inherits vehicle details and sets INSTALADO
    expect(enqueuedOps[1]?.payload.values).toEqual({
      J: 'Transportes Bull Dog',
      K: 'INSTALADO',
      L: 'Eco-01',
      M: 'Kenworth',
      N: '2022',
      O: 'SN-999',
    });
  });

  it.each([
    { technician: null, code: 'TECHNICIAN_NOT_FOUND' },
    { technician: { id: 'tech-1', active: false }, code: 'TECHNICIAN_INACTIVE' },
  ])('rejects a non-selectable technician: $code', async ({ technician, code }) => {
    mockPrisma.technician.findUnique.mockResolvedValue(technician);
    await expect(
      ordersService.createOrder('admin', {
        clientSheetId: 'CLIENT-DEMO',
        clientNameSnapshot: 'Cliente de prueba',
        scheduledAt: '2026-09-08T18:00:00.000Z',
        serviceType: 'INSTALLATION',
        technicianId: 'tech-1',
      }),
    ).rejects.toMatchObject({ code });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['REVIEW', 'UNINSTALLATION'] as const)(
    'preserves initial nested configuration for %s',
    async (serviceType) => {
      const result = await ordersService.createOrder('admin', {
        clientSheetId: 'CLIENT-DEMO',
        clientNameSnapshot: 'Cliente de prueba',
        scheduledAt: '2026-09-08T18:00:00.000Z',
        serviceType,
        technicianId: 'tech-1',
        units: [
          {
            label: 'Unidad',
            makeModel: 'Modelo',
            serialNumber: 'SERIAL-DEMO',
            equipment: [{ externalKey: 'EQ-DEMO' }],
          },
        ],
      });
      expect(result.serviceType).toBe(serviceType);
      expect(result.technicianId).toBe('tech-1');
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    },
  );

  it.each(OrderServiceTypeSchema.options)(
    'enforces the service policy on both addition methods: %s',
    async (serviceType) => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.DRAFT,
        serviceType,
      });
      mockPrisma.orderUnit.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'unit-1', orderId: 'order-1' });
      const addUnit = ordersService.addUnit('admin', 'order-1', {
        label: 'Unidad',
        makeModel: 'Modelo',
        serialNumber: 'DEMO',
      });
      if (serviceType === 'INSTALLATION') {
        await expect(addUnit).resolves.toMatchObject({ id: 'unit-1' });
        await expect(
          ordersService.assignEquipment('admin', 'order-1', 'unit-1', { externalKey: 'EQ-DEMO' }),
        ).resolves.toMatchObject({ id: 'eq-1' });
      } else {
        await expect(addUnit).rejects.toMatchObject({ code: 'ORDER_ADDITIONS_NOT_ALLOWED' });
        await expect(
          ordersService.assignEquipment('admin', 'order-1', 'unit-1', { externalKey: 'EQ-DEMO' }),
        ).rejects.toMatchObject({ code: 'ORDER_ADDITIONS_NOT_ALLOWED' });
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['FUEL_SENSOR', 'EQUIPMENT_REPLACEMENT'] as const)(
    'supports creating orders for %s',
    async (serviceType) => {
      const order = await ordersService.createOrder('admin', {
        clientSheetId: 'CLIENT-DEMO',
        clientNameSnapshot: 'Cliente de prueba',
        scheduledAt: '2026-09-08T18:00:00.000Z',
        serviceType,
        technicianId: 'tech-1',
      });
      expect(order).toBeDefined();
      expect(order.serviceType).toBe(serviceType);
    },
  );

  it('filters orders by service type', async () => {
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany.mockResolvedValue([]);
    await ordersService.listOrders({ id: 'admin', role: 'ADMIN' }, { serviceType: 'FUEL_SENSOR' });
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serviceType: 'FUEL_SENSOR' } }),
    );
  });

  it('continues to read historical orders without a technician', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'historical',
      technicianId: null,
      technician: null,
      units: [],
    });
    await expect(
      ordersService.getOrderById('historical', { id: 'admin', role: 'ADMIN' }),
    ).resolves.toMatchObject({ technicianId: null });
  });
});
