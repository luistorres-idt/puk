import { describe, expect, it, vi, beforeEach } from 'vitest';
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
  });

  it('creates an order in DRAFT status with folio and version 1', async () => {
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1' });

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
  });

  it('creates an order with units and equipment atomically', async () => {
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1' });
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
});
