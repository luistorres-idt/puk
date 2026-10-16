import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, type PrismaClient } from '../../generated/prisma/client.js';
import { OrderPricingService } from './order-pricing.service.js';

interface MockDatabase {
  order: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

describe('OrderPricingService', () => {
  let mockPrisma: MockDatabase;
  let service: OrderPricingService;
  let enqueuedAudits: Array<Record<string, unknown>> = [];
  let enqueuedOutbox: Array<Record<string, unknown>> = [];

  const baseOrder = {
    id: '00000000-0000-4000-8000-000000000001',
    folio: 'OS-0001',
    status: OrderStatus.ASSIGNED,
    version: 1,
    serviceType: 'INSTALLATION',
    clientNameSnapshot: 'Cliente Demo',
    scheduledAt: new Date(),
    isHomeService: false,
    pricingVersion: 1,
    technicianId: '11111111-1111-1111-1111-111111111111',
    technician: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Tecnico Demo',
      installationRate: '500.00',
      departureCost: '200.00',
    },
    units: [
      {
        id: 'u-1',
        label: 'Unidad 1',
        serialNumber: 'SN-001',
        serviceType: 'INSTALLATION',
        equipment: [{ externalKey: 'EQ-1' }],
      },
    ],
  };

  beforeEach(() => {
    enqueuedAudits = [];
    enqueuedOutbox = [];

    const txMock = {
      order: {
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...baseOrder,
          ...data,
        })),
      },
      sheetSyncOperation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          enqueuedOutbox.push(...data);
          return { count: data.length };
        }),
      },
      auditLog: {
        createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
          enqueuedAudits.push(...data);
          return { count: data.length };
        }),
      },
    };

    mockPrisma = {
      order: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
    };

    service = new OrderPricingService(mockPrisma as unknown as PrismaClient);
  });

  it('updates pricing overrides on an unfinalized order (ASSIGNED) and audits ORDER_PRICING_CONFIGURED', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(baseOrder);

    const overrides = {
      rates: { INSTALLATION: '750.00' },
      travelExpenses: '300.00',
      reason: 'Ajuste de precio convenido',
    };

    const result = await service.updateOrderPricing('admin-1', baseOrder.id, overrides);

    expect(result.pricingOverrides).toEqual(overrides);
    expect(enqueuedAudits).toHaveLength(1);
    expect(enqueuedAudits[0]).toMatchObject({
      action: 'ORDER_PRICING_CONFIGURED',
      actorUserId: 'admin-1',
      entityId: baseOrder.id,
      entityType: 'Order',
    });
    // Unfinalized orders do not enqueue sheet sync
    expect(enqueuedOutbox).toHaveLength(0);
  });

  it('rejects pricing update on a CANCELLED order', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.CANCELLED,
    });

    await expect(service.updateOrderPricing('admin-1', baseOrder.id, {})).rejects.toMatchObject({
      code: 'INVALID_ORDER_STATE',
      status: 400,
    });
  });

  it('throws 404 when order is not found', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(service.updateOrderPricing('admin-1', 'non-existent', {})).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      status: 404,
    });
  });

  it('recalculates snapshot, bumps version, supersedes old sync, and enqueues SHEET_TECHNICAL_REPORT on COMPLETED order', async () => {
    const completedOrder = {
      ...baseOrder,
      status: OrderStatus.COMPLETED,
      pricingVersion: 2,
    };
    mockPrisma.order.findUnique.mockResolvedValue(completedOrder);

    const overrides = {
      rates: { INSTALLATION: '800.00' },
      travelExpenses: '350.00',
    };

    const result = await service.updateOrderPricing('admin-1', completedOrder.id, overrides);

    // Rate: 800 * 1 = 800, Travel: 350, Total: 1150
    expect(result.pricingVersion).toBe(3);
    expect(result.pricingBaseCost?.toFixed(2)).toBe('800.00');
    expect(result.pricingTravelExpenses?.toFixed(2)).toBe('350.00');
    expect(result.pricingTotal?.toFixed(2)).toBe('1150.00');
    expect(result.pricingBreakdown).toBeDefined();

    expect(enqueuedAudits).toHaveLength(1);
    expect(enqueuedAudits[0]).toMatchObject({
      action: 'ORDER_PRICING_ADJUSTED',
      actorUserId: 'admin-1',
      entityId: completedOrder.id,
    });

    expect(enqueuedOutbox).toHaveLength(1);
    expect(enqueuedOutbox[0]).toMatchObject({
      idempotencyKey: `REPORT:${completedOrder.id}:3`,
      operationType: 'SHEET_TECHNICAL_REPORT',
      orderId: completedOrder.id,
      payload: expect.objectContaining({
        folio: 'OS-0001',
        costo: '800.00',
        viaticos: '350.00',
        total: '1150.00',
      }),
    });
  });

  it('throws MISSING_TECHNICIAN when completed order has no technician', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.COMPLETED,
      technician: null,
    });

    await expect(service.updateOrderPricing('admin-1', baseOrder.id, {})).rejects.toMatchObject({
      code: 'MISSING_TECHNICIAN',
      status: 400,
    });
  });

  it('rejects calculated overflow before transaction, report scheduling, audit, or outbox effects', async () => {
    const completedOrder = {
      ...baseOrder,
      status: OrderStatus.COMPLETED,
      units: [
        {
          ...baseOrder.units[0],
          equipment: [{ externalKey: 'EQ-1' }, { externalKey: 'EQ-2' }],
        },
      ],
    };
    mockPrisma.order.findUnique.mockResolvedValue(completedOrder);
    const getNextScheduledAt = vi.fn(async () => new Date());
    service = new OrderPricingService(mockPrisma as unknown as PrismaClient, {
      technicalReportScheduling: { getNextScheduledAt },
    });

    await expect(
      service.updateOrderPricing('admin-1', completedOrder.id, {
        rates: { INSTALLATION: '99999999.99' },
      }),
    ).rejects.toMatchObject({ code: 'PRICING_AMOUNT_OUT_OF_RANGE', status: 400 });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(getNextScheduledAt).not.toHaveBeenCalled();
    expect(enqueuedAudits).toHaveLength(0);
    expect(enqueuedOutbox).toHaveLength(0);
  });
});
