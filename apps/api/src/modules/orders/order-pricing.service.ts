import type { OrderPricingOverrides } from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import { calculatePersistableOrderPricing, createPricingBreakdownSnapshot } from './pricing.js';
import { formatTechnicalReportRow } from '../reports/index.js';

export interface OrderPricingServiceOptions {
  technicalReportScheduling?: {
    getNextScheduledAt(reference?: Date): Promise<Date>;
  };
}

export class OrderPricingService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly options: OrderPricingServiceOptions = {},
  ) {}

  public async updateOrderPricing(
    actorUserId: string,
    orderId: string,
    overrides: OrderPricingOverrides,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        technician: true,
        units: {
          include: { equipment: true },
        },
      },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError(
        400,
        'INVALID_ORDER_STATE',
        'No se pueden modificar tarifas en una orden cancelada',
      );
    }

    const isFinalized =
      order.status === OrderStatus.COMPLETED || order.status === OrderStatus.FAILED_APPOINTMENT;

    if (!isFinalized) {
      return domainTransaction(this.prisma, async (tx, effects) => {
        const updated = await tx.order.update({
          where: { id: orderId },
          data: {
            pricingOverrides: overrides as unknown as Prisma.InputJsonValue,
          },
        });

        effects.audit({
          action: 'ORDER_PRICING_CONFIGURED',
          actorUserId,
          entityType: 'Order',
          entityId: orderId,
          before: order as unknown as Prisma.InputJsonValue,
          after: updated as unknown as Prisma.InputJsonValue,
        });

        return updated;
      });
    }

    if (!order.technician) {
      throw new AppError(400, 'MISSING_TECHNICIAN', 'La orden debe tener un técnico asignado');
    }

    const equipmentCount = (order.units ?? []).reduce(
      (sum, u) => sum + (u.equipment?.length ?? 0),
      0,
    );
    const items = (order.units ?? []).map((u) => ({
      serviceType: u.serviceType ?? order.serviceType,
      equipmentCount: u.equipment.length,
    }));

    const nextPricingVersion = (order.pricingVersion ?? 1) + 1;
    const now = new Date();

    const pricing = calculatePersistableOrderPricing({
      technician: order.technician,
      serviceType: order.serviceType,
      items,
      equipmentCount,
      isHomeService: order.isHomeService,
      pricingVersion: nextPricingVersion,
      snapshotAt: now,
      overrides,
    });

    const technicalReportScheduledFor =
      await this.options.technicalReportScheduling?.getNextScheduledAt(now);

    return domainTransaction(this.prisma, async (tx, effects) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          pricingUnitRate: pricing.unitRate,
          pricingAppliedQuantity: pricing.appliedQuantity,
          pricingBaseCost: pricing.baseCost,
          pricingDepartureCost: pricing.departureCost,
          pricingTravelExpenses: pricing.travelExpenses,
          pricingTotal: pricing.total,
          pricingCurrency: pricing.currency,
          pricingSnapshotAt: pricing.snapshotAt,
          pricingVersion: pricing.pricingVersion,
          pricingBreakdown: createPricingBreakdownSnapshot(
            pricing,
          ) as unknown as Prisma.InputJsonValue,
          pricingOverrides: overrides as unknown as Prisma.InputJsonValue,
        },
        include: {
          units: {
            include: { equipment: true },
          },
        },
      });

      const reportPayload = formatTechnicalReportRow(updated);
      await tx.sheetSyncOperation.updateMany({
        where: {
          operationType: 'SHEET_TECHNICAL_REPORT',
          orderId: order.id,
          status: 'PENDING',
        },
        data: { status: 'SUPERSEDED' },
      });

      effects.enqueue({
        idempotencyKey: `REPORT:${order.id}:${pricing.pricingVersion}`,
        ...(technicalReportScheduledFor
          ? {
              nextAttemptAt: technicalReportScheduledFor,
              scheduledFor: technicalReportScheduledFor,
            }
          : {}),
        operationType: 'SHEET_TECHNICAL_REPORT',
        orderId: order.id,
        payload: reportPayload as unknown as Prisma.InputJsonValue,
      });

      effects.audit({
        action: 'ORDER_PRICING_ADJUSTED',
        actorUserId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }
}
