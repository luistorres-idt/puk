import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type {
  CompleteEvidence,
  CompleteSignature,
  FailAppointment,
  PresignEvidence,
  PresignSignature,
  ReportDiscrepancy,
  RequireCorrection,
  SaveChecklistItem,
  UpdateExecutionNotes,
} from '@puk/contracts';
import { assertOrderAccess as assertSharedOrderAccess } from '../../auth/order-access-policy.js';
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
import type { GoogleDriveClient } from '../../integrations/google-drive/google-drive.client.js';
import type { DriveFolderResolver } from '../../integrations/google-drive/drive-folder-resolver.js';
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
  drive?: { client: GoogleDriveClient; folders: DriveFolderResolver };
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
  private readonly drive: ExecutionServiceOptions['drive'];
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
    this.drive = options.drive;
    this.maxEvidenceBytes = options.maxEvidenceBytes ?? 10 * 1024 * 1024; // 10MB
    this.maxSignatureBytes = options.maxSignatureBytes ?? 1024 * 1024; // 1MB
    this.presignedUrlTtlSeconds = options.presignedUrlTtlSeconds ?? 300;
    this.reportGeneration = options.reportGeneration;
    this.technicalReportScheduling = options.technicalReportScheduling;
  }

  public getStorageMode(): 'drive' | 's3' {
    return this.drive ? 'drive' : 's3';
  }

  public getEvidenceUploadLimit(): number {
    return this.maxEvidenceBytes;
  }

  public getSignatureUploadLimit(): number {
    return this.maxSignatureBytes;
  }

  private requireDrive(): NonNullable<ExecutionServiceOptions['drive']> {
    if (!this.drive)
      throw new AppError(404, 'DRIVE_STORAGE_DISABLED', 'Carga en Drive no disponible');
    return this.drive;
  }

  private requireLegacyStorage(): void {
    if (this.drive) {
      throw new AppError(
        409,
        'LEGACY_STORAGE_DISABLED',
        'El flujo de URLs firmadas no está disponible',
      );
    }
  }

  private async assertOrderAccess(userId: string, role: 'ADMIN' | 'TECHNICIAN', orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { technician: true },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    await assertSharedOrderAccess(
      this.prisma,
      { id: userId, role },
      orderId,
      'No tienes asignada esta orden de servicio',
    );

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

  private async validateImage(
    body: Uint8Array,
    mimeType: string,
    allowedMimeTypes: readonly string[],
    maxBytes: number,
  ): Promise<{ width: number; height: number }> {
    if (!allowedMimeTypes.includes(mimeType)) {
      throw new AppError(415, 'UNSUPPORTED_IMAGE_TYPE', 'Tipo de imagen no permitido');
    }
    if (body.byteLength === 0) {
      throw new AppError(400, 'EMPTY_FILE', 'El archivo está vacío');
    }
    if (body.byteLength > maxBytes) {
      throw new AppError(413, 'FILE_TOO_LARGE', 'El archivo excede el tamaño máximo permitido');
    }
    try {
      const image = sharp(body, { failOn: 'error', limitInputPixels: 40_000_000 });
      const metadata = await image.metadata();
      await image.stats(); // Decode the image, not just its header.
      const expectedFormat = mimeType.slice('image/'.length);
      if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
        throw new Error('Unexpected image format or dimensions');
      }
      return { width: metadata.width, height: metadata.height };
    } catch {
      throw new AppError(400, 'INVALID_IMAGE', 'El contenido no coincide con una imagen válida');
    }
  }

  public async uploadEvidenceFile(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    body: Uint8Array,
    mimeType: string,
    dimensions?: { width?: number | undefined; height?: number | undefined },
    idempotencyKey: string = randomUUID(),
  ) {
    const drive = this.requireDrive();
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'subir evidencias');
    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada en esta orden');
    }
    const image = await this.validateImage(
      body,
      mimeType,
      ['image/jpeg', 'image/png', 'image/webp'],
      this.maxEvidenceBytes,
    );
    if (
      (dimensions?.width !== undefined && dimensions.width !== image.width) ||
      (dimensions?.height !== undefined && dimensions.height !== image.height)
    ) {
      throw new AppError(
        400,
        'IMAGE_DIMENSIONS_MISMATCH',
        'Las dimensiones no coinciden con la imagen',
      );
    }

    const parentId = await drive.folders.ensureEvidenceFolder({
      clientSheetId: order.clientSheetId,
      clientNameSnapshot: order.clientNameSnapshot,
      serialNumber: unit.serialNumber,
      orderId,
      folio: order.folio,
    });
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
    const checksum = createHash('sha256').update(body).digest('hex');
    let evidence = await this.prisma.evidence.findUnique({ where: { idempotencyKey } });
    if (!evidence) {
      const id = randomUUID();
      const objectKey = await drive.client.generateId();
      try {
        evidence = await this.prisma.evidence.create({
          data: {
            id,
            orderUnitId: unitId,
            idempotencyKey,
            objectKey,
            mimeType,
            sizeBytes: body.byteLength,
            checksum,
            width: image.width,
            height: image.height,
            status: UploadStatus.PENDING,
            uploadedById: userId,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        evidence = await this.prisma.evidence.findUnique({ where: { idempotencyKey } });
        if (!evidence) throw error;
      }
    }
    if (
      evidence.orderUnitId !== unitId ||
      evidence.uploadedById !== userId ||
      evidence.mimeType !== mimeType ||
      evidence.sizeBytes !== body.byteLength ||
      evidence.checksum !== checksum ||
      evidence.deletedAt
    ) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'La clave de reintento corresponde a otra evidencia',
      );
    }
    if (evidence.status === UploadStatus.COMPLETED) return evidence;
    if (evidence.status !== UploadStatus.PENDING) {
      throw new AppError(409, 'EVIDENCE_NOT_PENDING', 'La evidencia no admite reintentos');
    }
    const uploaded = await drive.client.uploadFile({
      id: evidence.objectKey,
      parentId,
      name: `evidencia-${evidence.id}.${extension}`,
      mimeType,
      body,
    });
    if (uploaded.reused) {
      const remoteBody = await drive.client.getFile(evidence.objectKey);
      if (!remoteBody || createHash('sha256').update(remoteBody).digest('hex') !== checksum) {
        throw new AppError(
          409,
          'DRIVE_FILE_MISMATCH',
          'El archivo de Drive no coincide con la evidencia reservada',
        );
      }
    }
    // Keep the reservation and remote file on DB failure; retry reconciles both.
    await this.prisma.evidence.updateMany({
      where: { id: evidence.id, status: UploadStatus.PENDING },
      data: { status: UploadStatus.COMPLETED, completedAt: new Date() },
    });
    return this.prisma.evidence.findUniqueOrThrow({ where: { id: evidence.id } });
  }

  public async getEvidenceFile(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    evidenceId: string,
  ): Promise<{ body: Uint8Array; mimeType: string }> {
    const drive = this.requireDrive();
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { orderUnit: { include: { order: true } } },
    });
    if (!evidence || evidence.status !== UploadStatus.COMPLETED || evidence.deletedAt) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no disponible');
    }
    await this.assertOrderAccess(userId, role, evidence.orderUnit.order.id);
    const body = await drive.client.getFile(evidence.objectKey);
    if (!body)
      throw new AppError(404, 'EVIDENCE_FILE_NOT_FOUND', 'Archivo de evidencia no disponible');
    return { body, mimeType: evidence.mimeType };
  }

  public async uploadSignatureFile(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    body: Uint8Array,
    signerName: string,
    idempotencyKey: string = randomUUID(),
  ) {
    const drive = this.requireDrive();
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'subir firmas');
    const normalizedSigner = signerName.trim();
    if (!normalizedSigner) {
      throw new AppError(400, 'SIGNER_NAME_REQUIRED', 'Nombre del firmante requerido');
    }
    await this.validateImage(body, 'image/png', ['image/png'], this.maxSignatureBytes);
    const parentId = await drive.folders.ensureSharedOrderFolder({
      clientSheetId: order.clientSheetId,
      clientNameSnapshot: order.clientNameSnapshot,
      orderId,
      folio: order.folio,
    });
    const checksum = createHash('sha256').update(body).digest('hex');
    let reservation = await this.prisma.driveSignatureUpload.findUnique({
      where: { idempotencyKey },
    });
    if (!reservation) {
      const objectKey = await drive.client.generateId();
      try {
        reservation = await this.prisma.driveSignatureUpload.create({
          data: {
            idempotencyKey,
            orderId,
            actorUserId: userId,
            objectKey,
            signerName: normalizedSigner,
            checksum,
            sizeBytes: body.byteLength,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        reservation = await this.prisma.driveSignatureUpload.findUnique({
          where: { idempotencyKey },
        });
        if (!reservation) throw error;
      }
    }
    if (
      reservation.orderId !== orderId ||
      reservation.actorUserId !== userId ||
      reservation.signerName !== normalizedSigner ||
      reservation.checksum !== checksum ||
      reservation.sizeBytes !== body.byteLength
    ) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'La clave de reintento corresponde a otra firma',
      );
    }
    if (reservation.completedAt) {
      const current = await this.prisma.signature.findUnique({ where: { orderId } });
      if (current?.objectKey !== reservation.objectKey) {
        throw new AppError(409, 'SIGNATURE_SUPERSEDED', 'Esta firma ya fue reemplazada');
      }
      return current;
    }
    const uploaded = await drive.client.uploadFile({
      id: reservation.objectKey,
      parentId,
      name: `firma-${idempotencyKey}.png`,
      mimeType: 'image/png',
      body,
    });
    if (uploaded.reused) {
      const remoteBody = await drive.client.getFile(reservation.objectKey);
      if (!remoteBody || createHash('sha256').update(remoteBody).digest('hex') !== checksum) {
        throw new AppError(
          409,
          'DRIVE_FILE_MISMATCH',
          'El archivo de Drive no coincide con la firma reservada',
        );
      }
    }
    const committed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const attempt = await tx.driveSignatureUpload.findUniqueOrThrow({
        where: { idempotencyKey },
      });
      const current = await tx.signature.findUnique({ where: { orderId } });
      if (attempt.completedAt) {
        if (current?.objectKey !== attempt.objectKey) {
          throw new AppError(409, 'SIGNATURE_SUPERSEDED', 'Esta firma ya fue reemplazada');
        }
        return current;
      }
      const signature = await tx.signature.upsert({
        where: { orderId },
        create: {
          orderId,
          signerName: normalizedSigner,
          objectKey: attempt.objectKey,
          mimeType: 'image/png',
          sizeBytes: body.byteLength,
          signedAt: new Date(),
          capturedById: userId,
        },
        update: {
          signerName: normalizedSigner,
          objectKey: attempt.objectKey,
          mimeType: 'image/png',
          sizeBytes: body.byteLength,
          signedAt: new Date(),
          capturedById: userId,
        },
      });
      const previousObjectKey =
        current?.objectKey !== attempt.objectKey ? (current?.objectKey ?? null) : null;
      await tx.driveSignatureUpload.update({
        where: { idempotencyKey },
        data: { completedAt: new Date(), previousObjectKey },
      });
      return signature;
    });
    return committed;
  }

  public async getSignatureFile(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
  ): Promise<{ body: Uint8Array; mimeType: string; signerName: string }> {
    const drive = this.requireDrive();
    await this.assertOrderAccess(userId, role, orderId);
    const signature = await this.prisma.signature.findUnique({ where: { orderId } });
    if (!signature) throw new AppError(404, 'SIGNATURE_NOT_FOUND', 'Firma no encontrada');
    const body = await drive.client.getFile(signature.objectKey);
    if (!body)
      throw new AppError(404, 'SIGNATURE_FILE_NOT_FOUND', 'Archivo de firma no disponible');
    return { body, mimeType: signature.mimeType, signerName: signature.signerName };
  }

  public async presignEvidenceUpload(
    userId: string,
    role: 'ADMIN' | 'TECHNICIAN',
    orderId: string,
    unitId: string,
    input: PresignEvidence,
  ) {
    this.requireLegacyStorage();
    const order = await this.assertOrderAccess(userId, role, orderId);
    assertCanExecuteWork(order.status, 'subir evidencias');

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada en esta orden');
    }

    if (input.sizeBytes > this.maxEvidenceBytes) {
      throw new AppError(
        400,
        'FILE_TOO_LARGE',
        `El archivo excede el tamaño máximo de ${Math.round(this.maxEvidenceBytes / (1024 * 1024))} MB`,
      );
    }

    const extension =
      input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const objectKey = `evidence/${orderId}/${unitId}/${randomUUID()}.${extension}`;

    const uploadUrl = await this.storagePort.createUploadUrl(
      objectKey,
      input.mimeType,
      this.presignedUrlTtlSeconds,
    );

    const evidence = await this.prisma.evidence.create({
      data: {
        orderUnitId: unitId,
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
    this.requireLegacyStorage();
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { orderUnit: { include: { order: true } } },
    });

    if (!evidence) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Registro de evidencia no encontrado');
    }

    await this.assertOrderAccess(userId, role, evidence.orderUnit.order.id);

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
      include: { orderUnit: { include: { order: true } } },
    });

    if (!evidence) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no encontrada');
    }

    await this.assertOrderAccess(userId, role, evidence.orderUnit.order.id);

    return this.prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        status: UploadStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  public async getEvidenceUrl(userId: string, role: 'ADMIN' | 'TECHNICIAN', evidenceId: string) {
    this.requireLegacyStorage();
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { orderUnit: { include: { order: true } } },
    });

    if (!evidence || evidence.status !== UploadStatus.COMPLETED) {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidencia no disponible');
    }

    await this.assertOrderAccess(userId, role, evidence.orderUnit.order.id);

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
    this.requireLegacyStorage();
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
    this.requireLegacyStorage();
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
    this.requireLegacyStorage();
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
