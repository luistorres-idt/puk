import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { TechnicalReportSyncScheduleService } from '../orders/index.js';
import { TechnicalReportsService } from './technical-reports.service.js';

const techId = '00000000-0000-4000-8000-000000000001';
const orderId = '00000000-0000-4000-8000-000000000010';
const unitId = '00000000-0000-4000-8000-000000000020';
const actorId = '00000000-0000-4000-8000-000000000099';

function makeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: orderId,
    folio: 'OS-2026-0421',
    status: 'COMPLETED' as const,
    serviceType: 'INSTALLATION' as const,
    clientNameSnapshot: 'Transportes del Pacífico',
    technicianId: techId,
    technicianNameSnapshot: 'Carlos Méndez',
    pricingUnitRate: { toFixed: () => '1200.00' },
    pricingBaseCost: { toFixed: () => '2400.00' },
    pricingTravelExpenses: { toFixed: () => '350.00' },
    pricingTotal: { toFixed: () => '2750.00' },
    dhlShippingCost: { toFixed: () => '280.00' },
    pricingCurrency: 'MXN',
    pricingBreakdown: null,
    pricingOverrides: null,
    scheduledAt: new Date('2026-11-19T18:00:00.000Z'),
    completedAt: new Date('2026-11-19T20:00:00.000Z'),
    generalNotes: 'Incluye arneses.',
    failedReason: null,
    technician: {
      id: techId,
      name: 'Carlos Méndez',
      legalName: 'Taller GPS Sonora S.A.',
      taxData: 'TGS190412AB3',
      externalKey: 'TEC-0001',
    },
    units: [
      {
        id: unitId,
        label: 'ECO-201',
        serialNumber: 'SN-201',
        serviceType: 'INSTALLATION' as const,
        createdAt: new Date('2026-11-19T18:00:00.000Z'),
        equipment: [
          { imei: '864291045900111', externalId: null, externalKey: 'EQ-1' },
          { imei: '864291045900112', externalId: null, externalKey: 'EQ-2' },
        ],
      },
    ],
    ...overrides,
  };
}

function setup() {
  const tx = {
    order: {
      findMany: vi.fn().mockResolvedValue([makeOrder()]),
      findUnique: vi.fn().mockResolvedValue(makeOrder()),
      update: vi.fn().mockResolvedValue(
        makeOrder({
          dhlShippingCost: { toFixed: () => '450.00' },
        }),
      ),
    },
    technician: {
      findUnique: vi.fn().mockResolvedValue({
        id: techId,
        name: 'Carlos Méndez',
        externalKey: 'TEC-0001',
      }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const scheduleService = {
    getConfig: vi.fn().mockResolvedValue({
      cutoffWeekday: 2,
      syncWeekday: 3,
      syncTime: '17:00',
      timeZone: 'America/Hermosillo',
    }),
  };

  return {
    tx,
    prisma,
    scheduleService,
    service: new TechnicalReportsService(
      prisma as unknown as PrismaClient,
      scheduleService as unknown as TechnicalReportSyncScheduleService,
    ),
  };
}

describe('TechnicalReportsService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('groups weekly reportable orders by technician and includes DHL in totals', async () => {
    const report = await ctx.service.getReport({}, new Date('2026-11-20T18:00:00.000Z'));

    expect(report.summary).toMatchObject({
      totalOrders: 1,
      totalTechnicians: 1,
      totalEquipment: 2,
      baseCost: 2400,
      travelExpenses: 350,
      dhlShippingCost: 280,
      grandTotal: 3030,
      currency: 'MXN',
    });
    expect(report.groups[0]).toMatchObject({
      technicianId: techId,
      technicianName: 'Carlos Méndez',
      legalName: 'Taller GPS Sonora S.A.',
      taxData: 'TGS190412AB3',
      total: 3030,
    });
    expect(report.groups[0]?.orders[0]?.units[0]?.equipmentIdentifiers).toEqual([
      '864291045900111',
      '864291045900112',
    ]);
  });

  it('filters by IMEI search term across units', async () => {
    const matched = await ctx.service.getReport({ search: '5900112' });
    expect(matched.summary.totalOrders).toBe(1);

    const unmatched = await ctx.service.getReport({ search: 'NO-EXISTE' });
    expect(unmatched.summary.totalOrders).toBe(0);
  });

  it('updates dhlShippingCost on reportable orders with audit log and rejects drafts', async () => {
    const updated = await ctx.service.updateOrderDhlShipping(actorId, orderId, {
      dhlShippingCost: 450,
    });
    expect(updated.dhlShippingCost).toBe(450);
    expect(updated.total).toBe(3200);
    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ORDER_DHL_SHIPPING_UPDATED',
          entityType: 'Order',
          entityId: orderId,
        }),
      }),
    );

    ctx.tx.order.findUnique.mockResolvedValueOnce(makeOrder({ status: 'DRAFT' }));
    await expect(
      ctx.service.updateOrderDhlShipping(actorId, orderId, { dhlShippingCost: 100 }),
    ).rejects.toMatchObject({ status: 409, code: 'ORDER_NOT_REPORTABLE' });
  });

  it('exports consolidated and per-technician Excel files', async () => {
    const consolidated = await ctx.service.exportExcel({}, new Date('2026-11-20T18:00:00.000Z'));
    expect(consolidated.fileName).toMatch(/^Reporte_Tecnico_Consolidado_Semana_\d+\.xlsx$/);
    expect(consolidated.bytes.byteLength).toBeGreaterThan(1000);

    const individual = await ctx.service.exportExcel(
      { technicianId: techId },
      new Date('2026-11-20T18:00:00.000Z'),
    );
    expect(individual.fileName).toMatch(/^Reporte_Carlos_Mendez_Semana_\d+\.xlsx$/);
    expect(individual.bytes.byteLength).toBeGreaterThan(1000);
  });
});
