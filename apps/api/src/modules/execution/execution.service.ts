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
  type Prisma,
  UnitStatus,
  UploadStatus,
} from '../../generated/prisma/client.js';
import type { ObjectStoragePort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';

export const ALL_CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = [
  'DASHBOARD',
  'WINDOWS',
  'ACCESSORIES',
  'TRIMS',
  'BODYWORK',
];

export interface ExecutionServiceOptions {
  maxEvidenceBytes?: number;
  maxSignatureBytes?: number;
  presignedUrlTtlSeconds?: number;
}

export class ExecutionService {
  private readonly maxEvidenceBytes: number;
  private readonly maxSignatureBytes: number;
  private readonly presignedUrlTtlSeconds: number;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly storagePort: ObjectStoragePort,
    options: ExecutionServiceOptions = {},
  ) {
    this.maxEvidenceBytes = options.maxEvidenceBytes ?? 10 * 1024 * 1024; // 10MB
    this.maxSignatureBytes = options.maxSignatureBytes ?? 1024 * 1024; // 1MB
    this.presignedUrlTtlSeconds = options.presignedUrlTtlSeconds ?? 300;
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

    if (order.status !== OrderStatus.ASSIGNED && order.status !== OrderStatus.REQUIRES_CORRECTION) {
      throw new AppError(
        400,
        'INVALID_ORDER_STATE',
        'Solo se pueden iniciar órdenes en estado asignada o en corrección',
      );
    }

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
    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'La orden debe estar en progreso');
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
    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'La orden debe estar en progreso');
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
    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'La orden debe estar en progreso');
    }

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
    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'La orden debe estar en progreso');
    }

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
    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'La orden debe estar en progreso');
    }

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

    const missing: string[] = [];

    if (order.units.length === 0) {
      missing.push('No hay unidades registradas en la orden');
    }

    for (const unit of order.units) {
      // 1. All equipments verified
      for (const eq of unit.equipment) {
        if (eq.verificationStatus === EquipmentVerificationStatus.PENDING) {
          missing.push(
            `Equipo ${eq.externalKey} en unidad ${unit.label} pendiente de verificación`,
          );
        }
      }

      // 2. Checklist items for all 5 categories
      const checklist = unit.checklist;
      if (!checklist) {
        missing.push(`Checklist pendiente en unidad ${unit.label}`);
      } else {
        const itemMap = new Map(checklist.items.map((i) => [i.category, i]));
        for (const cat of ALL_CHECKLIST_CATEGORIES) {
          const item = itemMap.get(cat);
          if (!item) {
            missing.push(`Falta categoría ${cat} en checklist de unidad ${unit.label}`);
          }
        }

        // Check minimum 3 photos per unit
        const totalEvidence = checklist.items.reduce(
          (sum, item) => sum + (item.evidence?.length ?? 0),
          0,
        );
        if (totalEvidence < 3) {
          missing.push(
            `Se requieren al menos 3 fotografías de evidencia en unidad ${unit.label} (actualmente ${totalEvidence}/3)`,
          );
        }
      }
    }

    // 3. Signature
    if (!order.signature || !order.signature.signerName) {
      missing.push('Falta firma y nombre del cliente');
    }

    return {
      isComplete: missing.length === 0,
      missingRequirements: missing,
    };
  }

  public async completeOrder(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    const order = await this.assertOrderAccess(userId, role, orderId);

    if (
      order.status !== OrderStatus.IN_PROGRESS &&
      order.status !== OrderStatus.REQUIRES_CORRECTION
    ) {
      throw new AppError(
        400,
        'INVALID_ORDER_STATE',
        'Solo se pueden completar órdenes en progreso',
      );
    }

    const completeness = await this.validateCompleteness(orderId);
    if (!completeness.isComplete) {
      throw new AppError(
        400,
        'ORDER_INCOMPLETE',
        'La orden no cumple con todos los requisitos para finalizarse',
        { missing: completeness.missingRequirements },
      );
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
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
          completedAt: new Date(),
        },
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
  }

  public async failAppointment(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    input: FailAppointment,
  ) {
    const order = await this.assertOrderAccess(userId, role, orderId);

    if (order.status !== OrderStatus.ASSIGNED && order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(
        400,
        'INVALID_ORDER_STATE',
        'Solo se pueden marcar como cita fallida órdenes asignadas o en progreso',
      );
    }

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

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.FAILED_APPOINTMENT,
          failedReason: input.failedReason,
          completedAt: new Date(),
        },
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
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.IN_PROGRESS) {
      throw new AppError(
        400,
        'INVALID_ORDER_STATE',
        'Solo se puede solicitar corrección a órdenes completadas o en progreso',
      );
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REQUIRES_CORRECTION,
          generalNotes: `${order.generalNotes ? `${order.generalNotes}\n` : ''}Corrección solicitada: ${input.notes}`,
        },
      });

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
