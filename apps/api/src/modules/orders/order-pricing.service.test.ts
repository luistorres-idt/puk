import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, type PrismaClient } from '../../generated/prisma/client.js';
import { OrderPricingService } from './order-pricing.service.js';

describe('OrderPricingService', () => {
  let mockPrisma: any;
  let service: OrderPricingService;
  let enqueuedAudits: any[] = [];
  let enqueuedOutbox: any[] = [];

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
        update: vi.fn(async ({ data }) => ({
          ...baseOrder,
          ...data,
        })),
      },
      sheetSyncOperation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn(async ({ data }) => {
          enqueuedOutbox.push(...data);
          return { count: data.length };
        }),
      },
      auditLog: {
        createMany: vi.fn(async ({ data }) => {
          enqueuedAudits.push(...data);
          return { count: data.length };
        }),
      },
    };

    mockPrisma = {
      order: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(txMock)),
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

    await expect(
      service.updateOrderPricing('admin-1', baseOrder.id, {}),
    ).rejects.toMatchObject({
      code: 'INVALID_ORDER_STATE',
      status: 400,
    });
  });

  it('throws 404 when order is not found', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(
      service.updateOrderPricing('admin-1', 'non-existent', {}),
    ).rejects.toMatchObject({
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

    await expect(
      service.updateOrderPricing('admin-1', baseOrder.id, {}),
    ).rejects.toMatchObject({
      code: 'MISSING_TECHNICIAN',
      status: 400,
    });
  });
});
