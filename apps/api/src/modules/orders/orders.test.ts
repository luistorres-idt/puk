import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrderServiceTypeSchema, type ExternalEquipment } from '@puk/contracts';
import { OrdersService } from './orders.service.js';
import { getOrderCreationRequestHash } from './order-create-idempotency.js';
import { SyncService } from './sync.service.js';
import { GoogleSheetsCatalogService } from '../../integrations/google-sheets/google-sheets.service.js';
import type { SheetsPort } from '../../integrations/ports.js';
import {
  FailedAppointmentResolution,
  OrderStatus,
  SyncStatus,
  type PrismaClient,
} from '../../generated/prisma/client.js';

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
    count: ReturnType<typeof vi.fn>;
  };
  orderEquipment: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  technician: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  sharedTechnicianAccess: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  sheetSyncOperation: {
    findUnique: ReturnType<typeof vi.fn>;
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
          $queryRaw: vi.fn(async () => [{ id: 'order-1' }]),
          order: {
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
              id: where.id,
              status: OrderStatus.DRAFT,
            })),
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
            count: vi.fn(async () => 0),
            findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
              id: where.id,
              orderId: 'order-1',
              serviceType: 'INSTALLATION',
            })),
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
              const nestedEquipment = (
                data.equipment as { create?: Array<Record<string, unknown>> } | undefined
              )?.create;
              return {
                id: 'unit-1',
                ...data,
                equipment: (nestedEquipment ?? []).map((equipment, index) => ({
                  id: `eq-${index + 1}`,
                  ...equipment,
                })),
              };
            }),
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
            count: vi.fn(async () => 0),
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
        count: vi.fn(),
      },
      orderEquipment: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        count: vi.fn(),
      },
      technician: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      sharedTechnicianAccess: {
        findUnique: vi.fn(),
      },
      sheetSyncOperation: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    ordersService = new OrdersService(mockPrisma as unknown as PrismaClient, catalogService);
    syncService = new SyncService(mockPrisma as unknown as PrismaClient, sheetsPort);
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1', active: true });
    mockPrisma.sheetSyncOperation.updateMany.mockResolvedValue({ count: 1 });
  });

  it('returns a least-privilege execution read model for shared technicians', async () => {
    const actorId = '00000000-0000-4000-8000-000000000010';
    const orderId = '00000000-0000-4000-8000-000000000011';
    const technicianId = '00000000-0000-4000-8000-000000000012';
    mockPrisma.order.findUnique
      .mockResolvedValueOnce({ id: orderId, status: OrderStatus.ASSIGNED, technicianId })
      .mockResolvedValueOnce({
        id: orderId,
        folio: 'OS-SECURE',
        status: OrderStatus.ASSIGNED,
        serviceType: 'INSTALLATION',
        clientNameSnapshot: 'Client',
        scheduledAt: new Date('2026-09-14T18:00:00.000Z'),
        isHomeService: false,
        serviceAddress: null,
        generalNotes: null,
        correctionReason: null,
        technician: {
          id: technicianId,
          name: 'Technician',
          taxData: 'private',
          installationRate: '500.00',
        },
        units: [],
        signature: null,
        createdBy: { email: 'admin@example.com' },
        syncOperations: [{ id: 'operation-1' }],
      });
    mockPrisma.user.findUnique.mockResolvedValue({ active: true, technicianId: null });
    mockPrisma.sharedTechnicianAccess.findUnique.mockResolvedValue({
      userId: actorId,
      orderId,
    });

    const result = await ordersService.getOrderExecutionById(orderId, {
      id: actorId,
      role: 'TECHNICIAN',
    });

    expect(result).not.toHaveProperty('createdBy');
    expect(result).not.toHaveProperty('syncOperations');
    expect(result.technician).toEqual({ id: technicianId, name: 'Technician' });
    expect(result.scheduledAt).toBe('2026-09-14T18:00:00.000Z');
    expect(mockPrisma.order.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: orderId },
      select: expect.not.objectContaining({
        createdBy: expect.anything(),
        syncOperations: expect.anything(),
      }),
    });
  });

  it('rejects technicians from the administrative order detail', async () => {
    await expect(
      ordersService.getOrderById('00000000-0000-4000-8000-000000000011', {
        id: '00000000-0000-4000-8000-000000000010',
        role: 'TECHNICIAN',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('leaves a retried sync operation unattempted until a worker claims it', async () => {
    mockPrisma.sheetSyncOperation.findUnique.mockResolvedValue({
      id: 'op-failed',
      status: SyncStatus.FAILED,
    });
    mockPrisma.sheetSyncOperation.update.mockResolvedValue({
      id: 'op-failed',
      status: SyncStatus.PENDING,
    });

    await syncService.retryOperation('op-failed');

    expect(mockPrisma.sheetSyncOperation.update).toHaveBeenCalledWith({
      where: { id: 'op-failed' },
      data: {
        attempts: 0,
        lastAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextAttemptAt: expect.any(Date),
        status: SyncStatus.PENDING,
      },
    });
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

  it('returns the original order for an identical idempotent retry without creating again', async () => {
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1', active: true });
    const input = {
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      serviceType: 'INSTALLATION' as const,
      scheduledAt: new Date().toISOString(),
      technicianId: 'tech-1',
    };
    const key = '00000000-0000-4000-8000-000000000014';
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);

    const created = await ordersService.createOrder('user-admin-1', input, key);
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      ...created,
      creationIdempotencyKey: key,
      creationRequestHash: getOrderCreationRequestHash(input),
    });
    const replayed = await ordersService.createOrder('user-admin-1', input, key);

    expect(replayed).toEqual(created);
    expect(replayed).not.toHaveProperty('creationRequestHash');
    expect(replayed).not.toHaveProperty('creationIdempotencyKey');
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('rejects an idempotency key reused with a different order payload', async () => {
    const input = {
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      serviceType: 'INSTALLATION' as const,
      scheduledAt: new Date().toISOString(),
      technicianId: 'tech-1',
    };
    const key = '00000000-0000-4000-8000-000000000015';
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      id: 'existing-order',
      creationRequestHash: getOrderCreationRequestHash({ ...input, generalNotes: 'different' }),
    });

    await expect(ordersService.createOrder('user-admin-1', input, key)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('recovers the winner after a concurrent idempotency insert loses the unique race', async () => {
    mockPrisma.technician.findUnique.mockResolvedValue({ id: 'tech-1', active: true });
    const input = {
      clientSheetId: 'CLI-1',
      clientNameSnapshot: 'Transportes Bull Dog',
      serviceType: 'INSTALLATION' as const,
      scheduledAt: new Date().toISOString(),
      technicianId: 'tech-1',
    };
    const key = '00000000-0000-4000-8000-000000000016';
    const winner = {
      id: 'winner-order',
      creationRequestHash: getOrderCreationRequestHash(input),
    };
    mockPrisma.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    mockPrisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(ordersService.createOrder('user-admin-1', input, key)).resolves.toEqual({
      id: winner.id,
    });
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
    mockPrisma.orderEquipment.findMany.mockResolvedValue([
      {
        id: 'active-eq',
        externalKey: 'EQ-ALREADY-ACTIVE',
        imei: null,
        activeAssignment: true,
        orderUnit: { orderId: 'active-order' },
      },
    ]);

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

  it('adds a unit and its equipment in the same transaction', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.DRAFT,
      serviceType: 'EQUIPMENT_REPLACEMENT',
    });
    mockPrisma.orderUnit.findUnique.mockResolvedValue(null);
    mockPrisma.orderEquipment.findFirst.mockResolvedValue(null);

    const unit = await ordersService.addUnit('user-admin-1', 'order-1', {
      label: 'Camion 1',
      makeModel: 'Kenworth T680',
      serialNumber: 'SERIAL-123',
      serviceType: 'EQUIPMENT_REPLACEMENT',
      equipment: [{ externalKey: 'EQ-OLD' }, { externalKey: 'EQ-NEW' }],
    });

    expect(unit.equipment).toEqual([
      expect.objectContaining({ externalKey: 'EQ-OLD' }),
      expect.objectContaining({ externalKey: 'EQ-NEW' }),
    ]);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('prevents assigning duplicate equipment within the same order', async () => {
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
      id: 'existing-eq',
      externalKey: 'EQ-001',
    });

    await expect(
      ordersService.assignEquipment('user-admin-1', 'order-1', 'unit-1', {
        externalKey: 'EQ-001',
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_EQUIPMENT',
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
    mockPrisma.orderEquipment.findFirst.mockImplementation(
      async (args: { where?: { orderUnit?: unknown } }) => {
        if (args?.where?.orderUnit) {
          return null; // Not in this order
        }
        return {
          id: 'other-eq',
          externalKey: 'EQ-001',
          activeAssignment: true,
        };
      },
    );

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
        operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
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

  it('skips an outbox operation claimed by another worker', async () => {
    const updateSpy = vi.spyOn(sheetsPort, 'updateAssignment');
    mockPrisma.sheetSyncOperation.findMany.mockResolvedValue([
      {
        id: 'op-claimed',
        operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
        status: SyncStatus.PENDING,
        attempts: 0,
        payload: { externalKey: 'EQ-001', row: 2, values: { J: 'Cliente' } },
      },
    ]);
    mockPrisma.sheetSyncOperation.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(syncService.processPendingOperations()).resolves.toBe(0);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('reclaims a stale processing operation after its lease expires', async () => {
    const updateSpy = vi.spyOn(sheetsPort, 'updateAssignment');
    mockPrisma.sheetSyncOperation.findMany.mockResolvedValue([
      {
        id: 'op-stale',
        operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
        status: SyncStatus.PROCESSING,
        attempts: 0,
        payload: { externalKey: 'EQ-001', row: 2, values: { J: 'Cliente' } },
      },
    ]);

    await expect(syncService.processPendingOperations()).resolves.toBe(1);
    expect(updateSpy).toHaveBeenCalledOnce();
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
        {
          externalKey: 'EQ-001',
          hasValidIdentity: true,
          currentClient: 'Transportes Bull Dog',
        } as unknown as ExternalEquipment,
        {
          externalKey: 'EQ-OLD',
          hasValidIdentity: true,
          currentClient: 'Transportes Bull Dog',
        } as unknown as ExternalEquipment,
        {
          externalKey: 'EQ-NEW',
          hasValidIdentity: true,
          currentClient: 'Transportes Bull Dog',
        } as unknown as ExternalEquipment,
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

    let enqueuedOps: Array<{ operationType: string; payload: { values: Record<string, string> } }> =
      [];
    mockPrisma.$transaction.mockImplementationOnce(
      async (callback: (tx: unknown) => Promise<unknown>) => {
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
      },
    );

    await ordersService.assignAndSyncOrder('admin', 'order-uninst');
    expect(enqueuedOps).toHaveLength(1);
    expect(enqueuedOps[0]?.operationType).toBe('SHEET_EQUIPMENT_ASSIGNMENT');
    expect(enqueuedOps[0]?.payload.values).toEqual({
      J: '',
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

    mockPrisma.$transaction.mockImplementationOnce(
      async (callback: (tx: unknown) => Promise<unknown>) => {
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
      },
    );

    await ordersService.assignAndSyncOrder('admin', 'order-replace');
    expect(enqueuedOps).toHaveLength(2);
    // Old equipment retired to STOCK TECNICO
    expect(enqueuedOps[0]?.payload.values).toEqual({
      J: '',
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
    'allows additions in draft for any service type: %s',
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
        serviceType,
      });
      await expect(addUnit).resolves.toMatchObject({ id: 'unit-1' });
      await expect(
        ordersService.assignEquipment('admin', 'order-1', 'unit-1', { externalKey: 'EQ-DEMO' }),
      ).resolves.toMatchObject({ id: 'eq-1' });
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
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { serviceType: 'FUEL_SENSOR' },
                { units: { some: { serviceType: 'FUEL_SENSOR' } } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('includes the rescheduled order in the order list', async () => {
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany.mockResolvedValue([]);

    await ordersService.listOrders({ id: 'admin', role: 'ADMIN' }, {});

    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rescheduledOrder: { select: { id: true, folio: true, status: true } },
        }),
      }),
    );
  });

  it('continues to read historical orders without a technician', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000020',
      folio: 'OS-HISTORICAL',
      status: OrderStatus.COMPLETED,
      version: 1,
      serviceType: 'INSTALLATION',
      clientNameSnapshot: 'Historical client',
      clientSheetId: 'CLIENT-HISTORICAL',
      scheduledAt: new Date('2026-09-14T18:00:00.000Z'),
      isHomeService: false,
      serviceAddress: null,
      generalNotes: null,
      failedReason: null,
      failedAppointmentResolution: null,
      failedAppointmentResolvedAt: null,
      failedAppointmentResolutionReason: null,
      rescheduledFrom: null,
      rescheduledOrder: null,
      technician: null,
      units: [],
      signature: null,
      pricingBaseCost: { toString: () => '100.00' },
      pricingTravelExpenses: { toString: () => '25.00' },
      pricingTotal: { toString: () => '125.00' },
      pricingBreakdown: null,
    });
    const result = await ordersService.getOrderById('00000000-0000-4000-8000-000000000020', {
      id: 'admin',
      role: 'ADMIN',
    });

    expect(result).toMatchObject({
      technician: null,
      scheduledAt: '2026-09-14T18:00:00.000Z',
      pricingBaseCost: '100.00',
      pricingTravelExpenses: '25.00',
      pricingTotal: '125.00',
    });
  });
});

describe('failed appointment administrative resolution', () => {
  const failedOrder = {
    id: 'order-failed',
    folio: 'OS-FAILED',
    serviceType: 'INSTALLATION' as const,
    status: OrderStatus.FAILED_APPOINTMENT,
    clientSheetId: 'CLIENT-DEMO',
    clientNameSnapshot: 'Cliente Demo',
    technicianId: 'tech-1',
    technicianNameSnapshot: 'Técnico Uno',
    technicianExternalKeySnapshot: 'TECH-1',
    scheduledAt: new Date('2026-09-10T18:00:00.000Z'),
    isHomeService: true,
    serviceAddress: 'Dirección original',
    generalNotes: 'Notas originales',
    failedReason: 'Cliente ausente',
    completedAt: new Date('2026-09-10T18:30:00.000Z'),
    pricingTotal: 250,
    version: 4,
    failedAppointmentResolution: null,
    units: [
      {
        id: 'unit-old',
        label: 'Unidad 1',
        makeModel: 'Modelo',
        serialNumber: 'SERIAL-1',
        year: 2024,
        serviceType: 'INSTALLATION' as const,
        status: 'IN_PROGRESS' as const,
        equipment: [
          {
            id: 'equipment-old',
            sheetName: 'SALIDAS',
            sheetRowHint: 10,
            externalId: 'EQ-1',
            imei: '123456789012345',
            externalKey: 'EQ-1',
            activeAssignment: false,
            brandSnapshot: 'Marca',
            modelSnapshot: 'Modelo',
            lineSnapshot: 'Línea',
            iccidSnapshot: 'ICCID',
            carrierSnapshot: 'Carrier',
            equipmentConditionSnapshot: 'BUENO',
            serviceStatusSnapshot: 'ACTIVO',
            rawSnapshot: { A: 'valor' },
            verificationStatus: 'MATCHED' as const,
          },
        ],
      },
    ],
  };

  function createResolutionHarness() {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'order-rescheduled',
      ...data,
    }));
    const findUniqueOrThrow = vi.fn(async () => ({
      ...failedOrder,
      version: 5,
      failedAppointmentResolution: FailedAppointmentResolution.CANCELLED,
    }));
    const tx = {
      order: { create, updateMany, findUniqueOrThrow },
      auditLog: { createMany: vi.fn() },
      sheetSyncOperation: { createMany: vi.fn() },
    };
    const prisma = {
      order: { findUnique: vi.fn(async () => failedOrder) },
      technician: {
        findUnique: vi.fn(async () => ({
          id: 'tech-1',
          name: 'Técnico Uno',
          externalKey: 'TECH-1',
          active: true,
        })),
      },
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    return {
      create,
      findUniqueOrThrow,
      prisma,
      service: new OrdersService(prisma as unknown as PrismaClient),
      tx,
      updateMany,
    };
  }

  it('creates a clean draft copy while preserving the failed order', async () => {
    const harness = createResolutionHarness();
    const result = await harness.service.rescheduleFailedAppointment('admin-1', failedOrder.id, {
      scheduledAt: '2099-09-15T18:00:00.000Z',
      version: 4,
    });

    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: failedOrder.id,
          version: 4,
          failedAppointmentResolution: null,
        }),
        data: expect.objectContaining({
          failedAppointmentResolution: FailedAppointmentResolution.RESCHEDULED,
        }),
      }),
    );
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.DRAFT,
          rescheduledFromOrderId: failedOrder.id,
          scheduledAt: new Date('2099-09-15T18:00:00.000Z'),
          units: {
            create: [
              expect.objectContaining({
                status: 'PENDING',
                equipment: {
                  create: [
                    expect.objectContaining({
                      activeAssignment: false,
                      verificationStatus: 'PENDING',
                    }),
                  ],
                },
              }),
            ],
          },
        }),
      }),
    );
    const createdData = harness.create.mock.calls[0]?.[0]?.data;
    expect(createdData).not.toHaveProperty('failedReason');
    expect(createdData).not.toHaveProperty('completedAt');
    expect(createdData).not.toHaveProperty('pricingTotal');
    expect(result).toMatchObject({ id: 'order-rescheduled', status: OrderStatus.DRAFT });
    expect(harness.prisma.$transaction).toHaveBeenCalledOnce();
    expect(harness.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      harness.create.mock.invocationCallOrder[0]!,
    );
    expect(harness.create.mock.invocationCallOrder[0]).toBeLessThan(
      harness.tx.auditLog.createMany.mock.invocationCallOrder[0]!,
    );
    expect(harness.tx.auditLog.createMany).toHaveBeenCalledOnce();
    expect(harness.tx.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: 'FAILED_APPOINTMENT_RESCHEDULED',
          entityId: failedOrder.id,
          after: expect.objectContaining({ rescheduledOrderId: 'order-rescheduled' }),
        }),
        expect.objectContaining({
          action: 'ORDER_CREATED_FROM_FAILED_APPOINTMENT',
          entityId: 'order-rescheduled',
        }),
      ],
    });
    expect(harness.tx.sheetSyncOperation.createMany).not.toHaveBeenCalled();
  });

  it('preserves every historical unit when rescheduling an order above the new item limit', async () => {
    const harness = createResolutionHarness();
    const historicalUnits = Array.from({ length: 101 }, (_, index) => ({
      id: `unit-${index}`,
      label: `Unidad ${index}`,
      makeModel: 'Modelo histórico',
      serialNumber: `SERIAL-${index}`,
      year: 2024,
      serviceType: 'INSTALLATION' as const,
      status: 'IN_PROGRESS' as const,
      equipment: [],
    }));
    harness.prisma.order.findUnique.mockResolvedValue({
      ...failedOrder,
      units: historicalUnits,
    });

    await harness.service.rescheduleFailedAppointment('admin-1', failedOrder.id, {
      scheduledAt: '2099-09-15T18:00:00.000Z',
      version: 4,
    });

    const createdData = harness.create.mock.calls[0]?.[0]?.data;
    expect(createdData).toMatchObject({
      units: {
        create: historicalUnits.map(({ label, makeModel, serialNumber, year, serviceType }) => ({
          label,
          makeModel,
          serialNumber,
          year,
          serviceType,
          status: 'PENDING',
          equipment: { create: [] },
        })),
      },
    });
    expect((createdData?.units as { create: unknown[] } | undefined)?.create).toHaveLength(101);
  });

  it('preserves every historical equipment item when rescheduling above the new equipment limit', async () => {
    const harness = createResolutionHarness();
    const equipmentTemplate = failedOrder.units[0]!.equipment[0]!;
    const historicalEquipment = Array.from({ length: 501 }, (_, index) => ({
      ...equipmentTemplate,
      id: `equipment-${index}`,
      externalId: `EQ-${index}`,
      externalKey: `EQ-${index}`,
    }));
    harness.prisma.order.findUnique.mockResolvedValue({
      ...failedOrder,
      units: [{ ...failedOrder.units[0]!, equipment: historicalEquipment }],
    });

    await harness.service.rescheduleFailedAppointment('admin-1', failedOrder.id, {
      scheduledAt: '2099-09-15T18:00:00.000Z',
      version: 4,
    });

    const createdData = harness.create.mock.calls[0]?.[0]?.data;
    const clonedUnits = (
      createdData?.units as { create: Array<{ equipment: { create: unknown[] } }> }
    ).create;
    expect(clonedUnits).toHaveLength(1);
    const clonedEquipment = clonedUnits[0]!.equipment.create as Array<{
      externalKey: string;
      activeAssignment: boolean;
      verificationStatus: string;
      brandSnapshot: string;
      rawSnapshot: unknown;
    }>;
    expect(clonedEquipment).toHaveLength(501);
    expect(clonedEquipment.map(({ externalKey }) => externalKey)).toEqual(
      historicalEquipment.map(({ externalKey }) => externalKey),
    );
    expect(clonedEquipment[0]).toMatchObject({
      activeAssignment: false,
      verificationStatus: 'PENDING',
      brandSnapshot: equipmentTemplate.brandSnapshot,
      rawSnapshot: equipmentTemplate.rawSnapshot,
    });
    expect(clonedEquipment[500]).toMatchObject({
      activeAssignment: false,
      verificationStatus: 'PENDING',
      brandSnapshot: equipmentTemplate.brandSnapshot,
      rawSnapshot: equipmentTemplate.rawSnapshot,
    });
  });

  it('copies equipment snapshots without reactivating its assignment and uses the selected technician', async () => {
    const harness = createResolutionHarness();
    harness.prisma.technician.findUnique.mockResolvedValue({
      id: 'tech-2',
      name: 'Técnico Dos',
      externalKey: 'TECH-2',
      active: true,
    });

    await harness.service.rescheduleFailedAppointment('admin-1', failedOrder.id, {
      scheduledAt: '2099-09-15T18:00:00.000Z',
      technicianId: 'tech-2',
      version: 4,
    });

    expect(harness.prisma.technician.findUnique).toHaveBeenCalledWith({
      where: { id: 'tech-2' },
      select: { id: true, name: true, externalKey: true, active: true },
    });
    const createdData = harness.create.mock.calls[0]?.[0]?.data;
    expect(createdData).toMatchObject({
      technicianId: 'tech-2',
      technicianNameSnapshot: 'Técnico Dos',
      technicianExternalKeySnapshot: 'TECH-2',
      units: {
        create: [
          {
            label: 'Unidad 1',
            serialNumber: 'SERIAL-1',
            status: 'PENDING',
            equipment: {
              create: [
                {
                  externalKey: 'EQ-1',
                  sheetRowHint: 10,
                  brandSnapshot: 'Marca',
                  modelSnapshot: 'Modelo',
                  rawSnapshot: { A: 'valor' },
                  activeAssignment: false,
                  verificationStatus: 'PENDING',
                },
              ],
            },
          },
        ],
      },
    });
  });

  it('resolves cancellation without changing the failed outcome or its pricing', async () => {
    const harness = createResolutionHarness();
    const result = await harness.service.cancelOrder(
      'admin-1',
      failedOrder.id,
      'El cliente no desea reprogramar',
    );

    expect(harness.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedAppointmentResolution: FailedAppointmentResolution.CANCELLED,
          failedAppointmentResolutionReason: 'El cliente no desea reprogramar',
        }),
      }),
    );
    expect(harness.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: OrderStatus.FAILED_APPOINTMENT,
      failedAppointmentResolution: FailedAppointmentResolution.CANCELLED,
      pricingTotal: 250,
    });
  });

  it('rolls back draft creation when another request resolved the appointment first', async () => {
    const harness = createResolutionHarness();
    harness.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      harness.service.rescheduleFailedAppointment('admin-1', failedOrder.id, {
        scheduledAt: '2099-09-15T18:00:00.000Z',
        version: 4,
      }),
    ).rejects.toMatchObject({ code: 'ORDER_VERSION_CONFLICT', status: 409 });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.tx.auditLog.createMany).not.toHaveBeenCalled();
  });
});

describe('equipment removal ownership chain', () => {
  function harness() {
    const equipment = { id: 'eq-1', orderUnitId: 'unit-1' };
    const tx = {
      orderEquipment: { delete: vi.fn() },
      auditLog: { createMany: vi.fn() },
      sheetSyncOperation: { createMany: vi.fn() },
    };
    const database = {
      order: {
        findUnique: vi.fn(
          async () =>
            ({ id: 'order-1', status: OrderStatus.DRAFT as OrderStatus }) as {
              id: string;
              status: OrderStatus;
            } | null,
        ),
      },
      orderUnit: {
        findUnique: vi.fn(
          async () =>
            ({ id: 'unit-1', orderId: 'order-1' }) as { id: string; orderId: string } | null,
        ),
      },
      orderEquipment: { findUnique: vi.fn(async () => equipment as typeof equipment | null) },
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new OrdersService(database as unknown as PrismaClient);
    return {
      database,
      tx,
      equipment,
      invoke: () => service.removeEquipment('admin-1', 'order-1', 'unit-1', 'eq-1'),
    };
  }

  it.each(['missing', 'foreign'])(
    'rejects a %s unit before equipment lookup or a transaction',
    async (kind) => {
      const h = harness();
      h.database.orderUnit.findUnique.mockResolvedValue(
        kind === 'missing' ? null : { id: 'unit-1', orderId: 'order-2' },
      );
      await expect(h.invoke()).rejects.toMatchObject({ status: 404, code: 'UNIT_NOT_FOUND' });
      expect(h.database.orderEquipment.findUnique).not.toHaveBeenCalled();
      expect(h.database.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'foreign'])('rejects %s equipment before a transaction', async (kind) => {
    const h = harness();
    h.database.orderEquipment.findUnique.mockResolvedValue(
      kind === 'missing' ? null : { id: 'eq-1', orderUnitId: 'unit-2' },
    );
    await expect(h.invoke()).rejects.toMatchObject({ status: 404, code: 'EQUIPMENT_NOT_FOUND' });
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });

  it('preserves missing-order precedence', async () => {
    const h = harness();
    h.database.order.findUnique.mockResolvedValue(null);
    await expect(h.invoke()).rejects.toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });
    expect(h.database.orderUnit.findUnique).not.toHaveBeenCalled();
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });

  it('preserves order-state precedence', async () => {
    const h = harness();
    h.database.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
    });
    await expect(h.invoke()).rejects.toMatchObject({ status: 400, code: 'INVALID_ORDER_STATE' });
    expect(h.database.orderUnit.findUnique).not.toHaveBeenCalled();
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });

  it('removes valid equipment and preserves the transactional audit only', async () => {
    const h = harness();
    await h.invoke();
    expect(h.database.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.orderEquipment.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 'eq-1' } });
    expect(h.tx.auditLog.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [
        {
          action: 'EQUIPMENT_REMOVED',
          actorUserId: 'admin-1',
          entityType: 'OrderEquipment',
          entityId: 'eq-1',
          before: h.equipment,
        },
      ],
    });
    expect(h.tx.sheetSyncOperation.createMany).not.toHaveBeenCalled();
  });
});
