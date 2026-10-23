import {
  completeInventoryAssignments,
  releaseOrderInventory,
  releaseOrderInventoryForCorrection,
} from '../inventory/index.js';
import * as v from 'valibot';
import {
  OrderPricingOverridesReadSchema,
  type FailAppointment,
  type RequireCorrection,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, Prisma, UnitStatus, UploadStatus } from '../../generated/prisma/client.js';
import { logger } from '../../observability/logger.js';
import { AppError } from '../../shared/errors.js';
import {
  assertValidOrderTransition,
  calculatePersistableOrderPricing,
  createPricingBreakdownSnapshot,
} from '../orders/index.js';
import { formatTechnicalReportRow } from '../reports/index.js';
import { loadAccessibleExecutionOrder } from './execution-order-access.js';
import { evaluateOrderCompleteness } from './order-completeness.js';

export interface OrderFinalizationOptions {
  reportGeneration?: {
    requestGeneration(orderId: string, actorUserId?: string): Promise<unknown>;
  };
  technicalReportScheduling?: {
    getNextScheduledAt(reference?: Date): Promise<Date>;
  };
}

export class OrderFinalizationService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly options: OrderFinalizationOptions = {},
  ) {}

  public async validateCompleteness(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    await loadAccessibleExecutionOrder(this.prisma, userId, role, orderId);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        units: {
          include: {
            equipment: true,
            evidence: { where: { status: UploadStatus.COMPLETED, deletedAt: null } },
            checklist: {
              include: {
                items: true,
              },
            },
          },
        },
        signature: true,
      },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    return evaluateOrderCompleteness(order);
  }

  public async completeOrder(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    const order = await loadAccessibleExecutionOrder(this.prisma, userId, role, orderId);

    assertValidOrderTransition(
      order.status,
      OrderStatus.COMPLETED,
      'Solo se pueden completar órdenes en progreso',
    );

    const completeness = await this.validateCompleteness(userId, role, orderId);
    if (!completeness.isComplete) {
      throw new AppError(
        400,
        'ORDER_INCOMPLETE',
        'La orden no cumple con todos los requisitos para finalizarse',
        { missing: completeness.missingRequirements },
      );
    }

    const fullOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        technician: true,
        units: {
          include: { equipment: true },
        },
      },
    });

    if (!fullOrder) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (!fullOrder.technician) {
      throw new AppError(400, 'MISSING_TECHNICIAN', 'La orden debe tener un técnico asignado');
    }

    const equipmentCount = (fullOrder.units ?? []).reduce(
      (sum, u) => sum + (u.equipment?.length ?? 0),
      0,
    );

    const items = (fullOrder.units ?? []).map((u) => ({
      serviceType: u.serviceType ?? fullOrder.serviceType,
      equipmentCount: u.equipment.length,
    }));

    const pricing = calculatePersistableOrderPricing({
      technician: fullOrder.technician,
      serviceType: fullOrder.serviceType,
      items,
      equipmentCount,
      isHomeService: fullOrder.isHomeService,
      pricingVersion: (fullOrder.pricingVersion ?? 0) + 1,
      snapshotAt: new Date(),
      overrides: fullOrder.pricingOverrides
        ? v.parse(OrderPricingOverridesReadSchema, fullOrder.pricingOverrides)
        : null,
    });

    if (pricing.warnings && pricing.warnings.length > 0) {
      logger.warn('Orden completada con tarifa(s) no configurada(s) ($0.00) para el técnico', {
        orderId,
        technicianId: fullOrder.technician.id,
        warnings: pricing.warnings,
      });
    }

    const completionTime = new Date();
    const technicalReportScheduledFor =
      await this.options.technicalReportScheduling?.getNextScheduledAt(completionTime);
    const completedOrder = await domainTransaction(this.prisma, async (tx, effects) => {
      // Mark units as completed
      await tx.orderUnit.updateMany({
        where: { orderId },
        data: { status: UnitStatus.COMPLETED },
      });

      // Release active assignment on equipment
      const units = await tx.orderUnit.findMany({
        where: { orderId },
        select: { id: true },
      });
      const unitIds = units.map((u) => u.id);
      await tx.orderEquipment.updateMany({
        where: { orderUnitId: { in: unitIds } },
        data: { activeAssignment: false },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: completionTime,
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
          technicianNameSnapshot: pricing.technicianNameSnapshot,
          technicianExternalKeySnapshot: pricing.technicianExternalKeySnapshot,
        },
        include: {
          units: {
            include: { equipment: true },
          },
        },
      });

      await completeInventoryAssignments(tx, {
        orderId,
        service: fullOrder.serviceType,
        clientId: fullOrder.clientSheetId,
        clientName: fullOrder.clientNameSnapshot,
        pricingVersion: pricing.pricingVersion,
        enqueue: effects.enqueue,
        units: fullOrder.units,
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
        action: 'ORDER_COMPLETED',
        actorUserId: userId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });

    // El cierre de la orden no se revierte si el trabajo de generación no puede encolarse.
    // El administrador puede solicitarlo nuevamente desde el detalle de la orden.
    await this.options.reportGeneration?.requestGeneration(orderId, userId).catch((error) => {
      logger.error('No se pudo encolar la generación del PDF al completar la orden', {
        error,
        orderId,
      });
    });
    return {
      ...completedOrder,
      warnings: pricing.warnings ?? [],
    };
  }

  public async failAppointment(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    input: FailAppointment,
  ) {
    const order = await loadAccessibleExecutionOrder(this.prisma, userId, role, orderId);

    assertValidOrderTransition(
      order.status,
      OrderStatus.FAILED_APPOINTMENT,
      'Solo se pueden marcar como cita fallida órdenes asignadas o en progreso',
    );

    const fullOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        technician: true,
        units: {
          include: { equipment: true },
        },
      },
    });

    if (!fullOrder) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    const equipmentCount = (fullOrder.units ?? []).reduce(
      (sum, u) => sum + (u.equipment?.length ?? 0),
      0,
    );

    const pricing = fullOrder.technician
      ? calculatePersistableOrderPricing({
          technician: fullOrder.technician,
          serviceType: 'FAILED_APPOINTMENT',
          equipmentCount,
          isHomeService: fullOrder.isHomeService,
          pricingVersion: (fullOrder.pricingVersion ?? 0) + 1,
          snapshotAt: new Date(),
          overrides: fullOrder.pricingOverrides
            ? v.parse(OrderPricingOverridesReadSchema, fullOrder.pricingOverrides)
            : null,
        })
      : null;

    const completionTime = new Date();
    const technicalReportScheduledFor =
      await this.options.technicalReportScheduling?.getNextScheduledAt(completionTime);
    return domainTransaction(this.prisma, async (tx, effects) => {
      await releaseOrderInventory(tx, orderId, fullOrder.units);
      // Release equipment
      const units = await tx.orderUnit.findMany({
        where: { orderId },
        select: { id: true },
      });
      const unitIds = units.map((u) => u.id);
      await tx.orderEquipment.updateMany({
        where: { orderUnitId: { in: unitIds } },
        data: { activeAssignment: false },
      });

      const nextVersion =
        pricing?.pricingVersion ?? (order.pricingVersion ? order.pricingVersion + 1 : 1);

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.FAILED_APPOINTMENT,
          failedReason: input.failedReason,
          completedAt: completionTime,
          pricingUnitRate: pricing?.unitRate ?? null,
          pricingAppliedQuantity:
            pricing?.appliedQuantity ?? (equipmentCount > 0 ? equipmentCount : 1),
          pricingBaseCost: pricing?.baseCost ?? new Prisma.Decimal('0.00'),
          pricingDepartureCost: pricing?.departureCost ?? new Prisma.Decimal('0.00'),
          pricingTravelExpenses: pricing?.travelExpenses ?? new Prisma.Decimal('0.00'),
          pricingTotal: pricing?.total ?? new Prisma.Decimal('0.00'),
          pricingCurrency: 'MXN',
          pricingSnapshotAt: pricing?.snapshotAt ?? new Date(),
          pricingVersion: nextVersion,
          pricingBreakdown: (pricing
            ? createPricingBreakdownSnapshot(pricing)
            : null) as unknown as Prisma.InputJsonValue,
          technicianNameSnapshot: pricing?.technicianNameSnapshot ?? order.technicianNameSnapshot,
          technicianExternalKeySnapshot:
            pricing?.technicianExternalKeySnapshot ?? order.technicianExternalKeySnapshot,
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
        idempotencyKey: `REPORT:${order.id}:${nextVersion}`,
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
        action: 'ORDER_FAILED_APPOINTMENT',
        actorUserId: userId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public async requireCorrection(adminUserId: string, orderId: string, input: RequireCorrection) {
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

    if (order.status === OrderStatus.COMPLETED) {
      const user = await this.prisma.user.findUnique({
        where: { id: adminUserId },
        select: { role: true },
      });
      if (user?.role !== 'ADMIN') {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Solo un administrador puede reabrir una orden completada',
        );
      }
    }

    assertValidOrderTransition(
      order.status,
      OrderStatus.REQUIRES_CORRECTION,
      'Solo se puede solicitar corrección a órdenes completadas o en progreso',
    );

    const equipmentCount = (order.units ?? []).reduce(
      (sum, u) => sum + (u.equipment?.length ?? 0),
      0,
    );
    const nextVersion = (order.pricingVersion ?? 1) + 1;
    let pricing: ReturnType<typeof calculatePersistableOrderPricing> | null = null;
    if (order.technician) {
      const items = (order.units ?? []).map((u) => ({
        serviceType: u.serviceType ?? order.serviceType,
        equipmentCount: u.equipment.length,
      }));
      pricing = calculatePersistableOrderPricing({
        technician: order.technician,
        serviceType: order.serviceType,
        items,
        equipmentCount,
        isHomeService: order.isHomeService,
        pricingVersion: nextVersion,
        snapshotAt: new Date(),
        overrides: order.pricingOverrides
          ? v.parse(OrderPricingOverridesReadSchema, order.pricingOverrides)
          : null,
      });
    }

    const correctionTime = new Date();
    const technicalReportScheduledFor = pricing
      ? await this.options.technicalReportScheduling?.getNextScheduledAt(correctionTime)
      : undefined;
    return domainTransaction(this.prisma, async (tx, effects) => {
      await releaseOrderInventoryForCorrection(
        tx,
        orderId,
        order.status === OrderStatus.COMPLETED,
        order.serviceType,
        order.clientSheetId,
        order.units,
      );

      const notesText = input.notes?.trim();
      const nextNotes = notesText
        ? `${order.generalNotes ? `${order.generalNotes}\n` : ''}Corrección solicitada: ${notesText}`
        : order.generalNotes;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REQUIRES_CORRECTION,
          correctionReason: notesText || null,
          generalNotes: nextNotes,
          ...(pricing
            ? {
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
                technicianNameSnapshot: pricing.technicianNameSnapshot,
                technicianExternalKeySnapshot: pricing.technicianExternalKeySnapshot,
              }
            : {}),
        },
        include: {
          units: {
            include: { equipment: true },
          },
        },
      });

      if (pricing) {
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
      }

      effects.audit({
        action: 'ORDER_CORRECTION_REQUESTED',
        actorUserId: adminUserId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }
}
