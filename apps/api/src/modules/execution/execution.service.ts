import type {
  FailAppointment,
  ReportDiscrepancy,
  RequireCorrection,
  SaveChecklistItem,
  UpdateExecutionNotes,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  EquipmentVerificationStatus,
  OrderStatus,
  Prisma,
  UnitStatus,
} from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import { assertCanExecuteWork, assertValidOrderTransition } from '../orders/index.js';
import { ExecutionMediaService, type ExecutionMediaOptions } from './execution-media.service.js';
import { loadAccessibleExecutionOrder } from './execution-order-access.js';
import {
  OrderFinalizationService,
  type OrderFinalizationOptions,
} from './order-finalization.service.js';
import { ALL_CHECKLIST_CATEGORIES, evaluateOrderCompleteness } from './order-completeness.js';

export { ALL_CHECKLIST_CATEGORIES, evaluateOrderCompleteness };

export interface ExecutionServiceOptions extends OrderFinalizationOptions, ExecutionMediaOptions {}

export class ExecutionService {
  private readonly media: ExecutionMediaService;
  private readonly finalization: OrderFinalizationService;

  public constructor(
    private readonly prisma: PrismaClient,
    options: ExecutionServiceOptions = {},
  ) {
    this.media = new ExecutionMediaService(prisma, options);
    this.finalization = new OrderFinalizationService(prisma, options);
  }

  public getEvidenceUploadLimit(): number {
    return this.media.getEvidenceUploadLimit();
  }

  public getSignatureUploadLimit(): number {
    return this.media.getSignatureUploadLimit();
  }

  private async assertOrderAccess(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    return loadAccessibleExecutionOrder(this.prisma, userId, role, orderId);
  }

  public async startOrder(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    const order = await this.assertOrderAccess(userId, role, orderId);

    assertValidOrderTransition(
      order.status,
      OrderStatus.IN_PROGRESS,
      'Solo se pueden iniciar órdenes en estado asignada o en corrección',
    );

    return domainTransaction(this.prisma, async (tx, effects) => {
      await tx.orderUnit.updateMany({
        where: { orderId },
        data: { status: UnitStatus.IN_PROGRESS },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.IN_PROGRESS,
          startedAt: order.startedAt ?? new Date(),
        },
      });

      effects.audit({
        action: 'ORDER_STARTED',
        actorUserId: userId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public async verifyEquipment(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    equipmentId: string,
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'verificar equipos');

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada');
    }

    const eq = await this.prisma.orderEquipment.findUnique({ where: { id: equipmentId } });
    if (!eq || eq.orderUnitId !== unitId) {
      throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo no encontrado');
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const updated = await tx.orderEquipment.update({
        where: { id: equipmentId },
        data: {
          verificationStatus: EquipmentVerificationStatus.MATCHED,
          verifiedAt: new Date(),
          verifiedById: userId,
        },
      });

      effects.audit({
        action: 'EQUIPMENT_VERIFIED',
        actorUserId: userId,
        entityType: 'OrderEquipment',
        entityId: equipmentId,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public async reportDiscrepancy(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    equipmentId: string,
    input: ReportDiscrepancy,
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'reportar discrepancias');

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada');
    }

    const eq = await this.prisma.orderEquipment.findUnique({ where: { id: equipmentId } });
    if (!eq || eq.orderUnitId !== unitId) {
      throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo no encontrado');
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const discrepancy = await tx.discrepancy.create({
        data: {
          orderId,
          orderUnitId: unitId,
          orderEquipmentId: equipmentId,
          type: input.type,
          description: input.description,
          expectedSnapshot: {
            externalKey: eq.externalKey,
            id: eq.externalId,
            imei: eq.imei,
            brand: eq.brandSnapshot,
            model: eq.modelSnapshot,
          },
          observedSnapshot: input.observedSnapshot ?? {},
          reportedById: userId,
        },
      });

      await tx.orderEquipment.update({
        where: { id: equipmentId },
        data: {
          verificationStatus: EquipmentVerificationStatus.DISCREPANCY_REPORTED,
          verifiedAt: new Date(),
          verifiedById: userId,
        },
      });

      effects.audit({
        action: 'DISCREPANCY_REPORTED',
        actorUserId: userId,
        entityType: 'Discrepancy',
        entityId: discrepancy.id,
        after: discrepancy as unknown as Prisma.InputJsonValue,
      });

      return discrepancy;
    });
  }

  public async saveChecklist(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    items: SaveChecklistItem[],
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'guardar el checklist');

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada');
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      let checklist = await tx.checklist.findUnique({ where: { orderUnitId: unitId } });
      if (!checklist) {
        checklist = await tx.checklist.create({
          data: {
            orderUnitId: unitId,
            completedById: userId,
            completedAt: new Date(),
          },
        });
      }

      for (const item of items) {
        await tx.checklistItem.upsert({
          where: {
            checklistId_category: {
              checklistId: checklist.id,
              category: item.category,
            },
          },
          create: {
            checklistId: checklist.id,
            category: item.category,
            condition: item.condition,
            notes: item.notes ?? null,
          },
          update: {
            condition: item.condition,
            notes: item.notes ?? null,
          },
        });
      }

      effects.audit({
        action: 'CHECKLIST_SAVED',
        actorUserId: userId,
        entityType: 'Checklist',
        entityId: checklist.id,
        after: { items } as unknown as Prisma.InputJsonValue,
      });

      return tx.checklist.findUnique({
        where: { id: checklist.id },
        include: { items: true },
      });
    });
  }

  public async updateExecutionNotes(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    input: UpdateExecutionNotes,
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'guardar las notas de ejecución');

    return domainTransaction(this.prisma, async (tx, effects) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { generalNotes: input.notes || null },
      });

      effects.audit({
        action: 'EXECUTION_NOTES_UPDATED',
        actorUserId: userId,
        entityType: 'Order',
        entityId: orderId,
        before: { generalNotes: order.generalNotes } as unknown as Prisma.InputJsonValue,
        after: { generalNotes: updated.generalNotes } as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public uploadEvidenceFile(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    body: Uint8Array,
    mimeType: string,
    dimensions?: { width?: number | undefined; height?: number | undefined },
    idempotencyKey?: string,
  ) {
    return this.media.uploadEvidenceFile(
      userId,
      role,
      orderId,
      unitId,
      body,
      mimeType,
      dimensions,
      idempotencyKey,
    );
  }

  public getEvidenceFile(userId: string, role: 'ADMIN' | 'TECHNICIAN', evidenceId: string) {
    return this.media.getEvidenceFile(userId, role, evidenceId);
  }

  public uploadSignatureFile(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    body: Uint8Array,
    signerName: string,
    idempotencyKey?: string,
  ) {
    return this.media.uploadSignatureFile(userId, role, orderId, body, signerName, idempotencyKey);
  }

  public getSignatureFile(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    return this.media.getSignatureFile(userId, role, orderId);
  }

  public deleteEvidence(userId: string, role: 'ADMIN' | 'TECHNICIAN', evidenceId: string) {
    return this.media.deleteEvidence(userId, role, evidenceId);
  }

  public validateCompleteness(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    return this.finalization.validateCompleteness(userId, role, orderId);
  }

  public completeOrder(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    return this.finalization.completeOrder(userId, role, orderId);
  }

  public failAppointment(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    input: FailAppointment,
  ) {
    return this.finalization.failAppointment(userId, role, orderId, input);
  }

  public requireCorrection(adminUserId: string, orderId: string, input: RequireCorrection) {
    return this.finalization.requireCorrection(adminUserId, orderId, input);
  }
}
