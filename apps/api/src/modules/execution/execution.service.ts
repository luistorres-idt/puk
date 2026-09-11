import { randomUUID } from 'node:crypto';
import type {
  ChecklistCategory,
  CompleteEvidence,
  CompleteSignature,
  FailAppointment,
  PresignEvidence,
  PresignSignature,
  ReportDiscrepancy,
  RequireCorrection,
  SaveChecklistItem,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  EquipmentVerificationStatus,
  OrderStatus,
  Prisma,
  UnitStatus,
  UploadStatus,
} from '../../generated/prisma/client.js';
import type { ObjectStoragePort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import { logger } from '../../observability/logger.js';
import {
  assertCanExecuteWork,
  assertValidOrderTransition,
  buildEquipmentSheetAssignment,
  calculateOrderPricing,
  createPricingBreakdownSnapshot,
} from '../orders/index.js';
import { formatTechnicalReportRow } from '../reports/index.js';
import { ALL_CHECKLIST_CATEGORIES, evaluateOrderCompleteness } from './order-completeness.js';

export { ALL_CHECKLIST_CATEGORIES, evaluateOrderCompleteness };

export interface ExecutionServiceOptions {
  maxEvidenceBytes?: number;
  maxSignatureBytes?: number;
  presignedUrlTtlSeconds?: number;
  reportGeneration?: {
    requestGeneration(orderId: string, actorUserId?: string): Promise<unknown>;
  };
  technicalReportScheduling?: {
    getNextScheduledAt(reference?: Date): Promise<Date>;
  };
}

export class ExecutionService {
  private readonly maxEvidenceBytes: number;
  private readonly maxSignatureBytes: number;
  private readonly presignedUrlTtlSeconds: number;
  private readonly reportGeneration: ExecutionServiceOptions['reportGeneration'];
  private readonly technicalReportScheduling: ExecutionServiceOptions['technicalReportScheduling'];

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly storagePort: ObjectStoragePort,
    options: ExecutionServiceOptions = {},
  ) {
    this.maxEvidenceBytes = options.maxEvidenceBytes ?? 10 * 1024 * 1024; // 10MB
    this.maxSignatureBytes = options.maxSignatureBytes ?? 1024 * 1024; // 1MB
    this.presignedUrlTtlSeconds = options.presignedUrlTtlSeconds ?? 300;
    this.reportGeneration = options.reportGeneration;
    this.technicalReportScheduling = options.technicalReportScheduling;
  }

  private async assertOrderAccess(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { technician: true },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (role === 'TECHNICIAN') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { technicianId: true },
      });
      if (!user?.technicianId || order.technicianId !== user.technicianId) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes asignada esta orden de servicio');
      }
    }

    return order;
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

  public async presignEvidenceUpload(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    category: ChecklistCategory,
    input: PresignEvidence,
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'subir evidencias');

    if (input.sizeBytes > this.maxEvidenceBytes) {
      throw new AppError(
        400,
        'FILE_TOO_LARGE',
        `El archivo excede el tamaño máximo de ${Math.round(this.maxEvidenceBytes / (1024 * 1024))} MB`,
      );
    }

    // Ensure checklist & item exist
    let checklist = await this.prisma.checklist.findUnique({ where: { orderUnitId: unitId } });
    if (!checklist) {
      checklist = await this.prisma.checklist.create({
        data: {
          orderUnitId: unitId,
          completedById: userId,
          completedAt: new Date(),
        },
      });
    }

    let checklistItem = await this.prisma.checklistItem.findUnique({
      where: {
        checklistId_category: {
          checklistId: checklist.id,
          category,
        },
      },
    });

    if (!checklistItem) {
      checklistItem = await this.prisma.checklistItem.create({
        data: {
          checklistId: checklist.id,
          category,
          condition: 'NOT_APPLICABLE',
        },
      });
    }

    const extension =
      input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const objectKey = `evidence/${orderId}/${unitId}/${category.toLowerCase()}/${randomUUID()}.${extension}`;

    const uploadUrl = await this.storagePort.createUploadUrl(
      objectKey,
      input.mimeType,
      this.presignedUrlTtlSeconds,
    );

    const evidence = await this.prisma.evidence.create({
      data: {
        checklistItemId: checklistItem.id,
        objectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: UploadStatus.PENDING,
        uploadedById: userId,
      },
    });

    return {
      evidenceId: evidence.id,
      uploadUrl,
      objectKey,
    };
  }

  public async completeEvidence(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    evidenceId: string,
    input: CompleteEvidence,
  ) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        checklistItem: {
          include: {
            checklist: {
              include: { orderUnit: { include: { order: true } } },
            },
          },
        },
      },
    });

    if (!evidence) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Registro de evidencia no encontrado');
    }

    await this.assertOrderAccess(userId, role, evidence.checklistItem.checklist.orderUnit.order.id);

    // Validate object exists in storage
    const head = await this.storagePort.headObject(evidence.objectKey);
    if (!head) {
      throw new AppError(
        400,
        'UPLOAD_NOT_FOUND',
        'El archivo no fue encontrado en el almacenamiento',
      );
    }

    if (head.bytes > this.maxEvidenceBytes) {
      throw new AppError(400, 'FILE_TOO_LARGE', 'El archivo subido excede el límite permitido');
    }

    const updated = await this.prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        status: UploadStatus.COMPLETED,
        completedAt: new Date(),
        sizeBytes: head.bytes,
        mimeType: head.mimeType || evidence.mimeType,
        checksum: input.checksum ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
      },
    });

    return updated;
  }

  public async deleteEvidence(userId: string, role: 'ADMIN' | 'TECHNICIAN', evidenceId: string) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        checklistItem: {
          include: {
            checklist: {
              include: { orderUnit: { include: { order: true } } },
            },
          },
        },
      },
    });

    if (!evidence) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada');
    }

    await this.assertOrderAccess(userId, role, evidence.checklistItem.checklist.orderUnit.order.id);

    return this.prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        status: UploadStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  public async getEvidenceUrl(userId: string, role: 'ADMIN' | 'TECHNICIAN', evidenceId: string) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        checklistItem: {
          include: {
            checklist: {
              include: { orderUnit: { include: { order: true } } },
            },
          },
        },
      },
    });

    if (!evidence || evidence.status !== UploadStatus.COMPLETED) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no disponible');
    }

    await this.assertOrderAccess(userId, role, evidence.checklistItem.checklist.orderUnit.order.id);

    const downloadUrl = await this.storagePort.createDownloadUrl(
      evidence.objectKey,
      this.presignedUrlTtlSeconds,
    );

    return { downloadUrl };
  }

  public async presignSignatureUpload(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    input: PresignSignature,
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'subir firmas');

    if (input.sizeBytes > this.maxSignatureBytes) {
      throw new AppError(400, 'FILE_TOO_LARGE', 'La firma excede el tamaño máximo permitido');
    }

    const objectKey = `signatures/${orderId}/${randomUUID()}.png`;
    const uploadUrl = await this.storagePort.createUploadUrl(
      objectKey,
      'image/png',
      this.presignedUrlTtlSeconds,
    );

    return {
      uploadUrl,
      objectKey,
    };
  }

  public async completeSignature(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    input: CompleteSignature,
    objectKey: string,
  ) {
    await this.assertOrderAccess(userId, role, orderId);

    const head = await this.storagePort.headObject(objectKey);
    if (!head) {
      throw new AppError(400, 'UPLOAD_NOT_FOUND', 'La firma no fue subida al almacenamiento');
    }

    return this.prisma.signature.upsert({
      where: { orderId },
      create: {
        orderId,
        signerName: input.signerName,
        objectKey,
        mimeType: head.mimeType || 'image/png',
        sizeBytes: head.bytes,
        signedAt: new Date(),
        capturedById: userId,
      },
      update: {
        signerName: input.signerName,
        objectKey,
        mimeType: head.mimeType || 'image/png',
        sizeBytes: head.bytes,
        signedAt: new Date(),
        capturedById: userId,
      },
    });
  }

  public async getSignatureUrl(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    await this.assertOrderAccess(userId, role, orderId);

    const signature = await this.prisma.signature.findUnique({ where: { orderId } });
    if (!signature) {
      throw new AppError(404, 'SIGNATURE_NOT_FOUND', 'Firma no encontrada');
    }

    const downloadUrl = await this.storagePort.createDownloadUrl(
      signature.objectKey,
      this.presignedUrlTtlSeconds,
    );

    return { downloadUrl, signerName: signature.signerName };
  }

  public async validateCompleteness(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        units: {
          include: {
            equipment: true,
            checklist: {
              include: {
                items: {
                  include: {
                    evidence: {
                      where: { status: UploadStatus.COMPLETED },
                    },
                  },
                },
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
    const order = await this.assertOrderAccess(userId, role, orderId);

    assertValidOrderTransition(
      order.status,
      OrderStatus.COMPLETED,
      'Solo se pueden completar órdenes en progreso',
    );

    const completeness = await this.validateCompleteness(orderId);
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

    const pricing = calculateOrderPricing({
      technician: fullOrder.technician,
      serviceType: fullOrder.serviceType,
      items,
      equipmentCount,
      isHomeService: fullOrder.isHomeService,
      pricingVersion: (fullOrder.pricingVersion ?? 0) + 1,
      snapshotAt: new Date(),
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
      await this.technicalReportScheduling?.getNextScheduledAt(completionTime);
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

      for (const unit of fullOrder.units) {
        for (const equipment of unit.equipment) {
          const values = buildEquipmentSheetAssignment({
            clientName: fullOrder.clientNameSnapshot,
            equipmentServiceStatus: equipment.serviceStatusSnapshot,
            serviceType: unit.serviceType ?? fullOrder.serviceType,
            unit,
          });
          if (!values) {
            continue;
          }

          effects.enqueue({
            idempotencyKey: `COMPLETE_ASSIGNMENT:${order.id}:${equipment.id}:${pricing.pricingVersion}`,
            operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
            orderId: order.id,
            payload: {
              externalKey: equipment.externalKey,
              row: equipment.sheetRowHint ?? 0,
              values,
            },
          });
        }
      }

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
    await this.reportGeneration?.requestGeneration(orderId, userId).catch((error) => {
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
    const order = await this.assertOrderAccess(userId, role, orderId);

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
      ? calculateOrderPricing({
          technician: fullOrder.technician,
          serviceType: 'FAILED_APPOINTMENT',
          equipmentCount,
          isHomeService: fullOrder.isHomeService,
          pricingVersion: (fullOrder.pricingVersion ?? 0) + 1,
          snapshotAt: new Date(),
        })
      : null;

    const completionTime = new Date();
    const technicalReportScheduledFor =
      await this.technicalReportScheduling?.getNextScheduledAt(completionTime);
    return domainTransaction(this.prisma, async (tx, effects) => {
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
    let pricing: ReturnType<typeof calculateOrderPricing> | null = null;
    if (order.technician) {
      const items = (order.units ?? []).map((u) => ({
        serviceType: u.serviceType ?? order.serviceType,
        equipmentCount: u.equipment.length,
      }));
      pricing = calculateOrderPricing({
        technician: order.technician,
        serviceType: order.serviceType,
        items,
        equipmentCount,
        isHomeService: order.isHomeService,
        pricingVersion: nextVersion,
        snapshotAt: new Date(),
      });
    }

    const correctionTime = new Date();
    const technicalReportScheduledFor = pricing
      ? await this.technicalReportScheduling?.getNextScheduledAt(correctionTime)
      : undefined;
    return domainTransaction(this.prisma, async (tx, effects) => {
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
