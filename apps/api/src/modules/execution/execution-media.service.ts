import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from '@puk/contracts';
import type {
  CompleteEvidence,
  CompleteSignature,
  PresignEvidence,
  PresignSignature,
} from '@puk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { UploadStatus } from '../../generated/prisma/client.js';
import type { ObjectStoragePort } from '../../integrations/ports.js';
import { ObjectTooLargeError } from '../../integrations/object-storage/object-too-large.error.js';
import type { GoogleDriveClient } from '../../integrations/google-drive/google-drive.client.js';
import type { DriveFolderResolver } from '../../integrations/google-drive/drive-folder-resolver.js';
import { AppError } from '../../shared/errors.js';
import { assertCanExecuteWork } from '../orders/index.js';
import { loadAccessibleExecutionOrder } from './execution-order-access.js';

export interface ExecutionMediaOptions {
  drive?: { client: GoogleDriveClient; folders: DriveFolderResolver };
  maxEvidenceBytes?: number;
  maxSignatureBytes?: number;
  presignedUrlTtlSeconds?: number;
}

export class ExecutionMediaService {
  private readonly drive: ExecutionMediaOptions['drive'];
  private readonly maxEvidenceBytes: number;
  private readonly maxSignatureBytes: number;
  private readonly presignedUrlTtlSeconds: number;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly storagePort: ObjectStoragePort,
    options: ExecutionMediaOptions = {},
  ) {
    this.drive = options.drive;
    this.maxEvidenceBytes = options.maxEvidenceBytes ?? 10 * 1024 * 1024; // 10MB
    this.maxSignatureBytes = options.maxSignatureBytes ?? 1024 * 1024; // 1MB
    this.presignedUrlTtlSeconds = options.presignedUrlTtlSeconds ?? 300;
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

  private requireDrive(): NonNullable<ExecutionMediaOptions['drive']> {
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
    return loadAccessibleExecutionOrder(this.prisma, userId, role, orderId);
  }

  private async validateImage(
    body: Uint8Array,
    mimeType: string,
    allowedMimeTypes: readonly string[],
    maxBytes: number,
  ): Promise<{ width: number; height: number; format: string | undefined }> {
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
      const image = sharp(body, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS });
      const metadata = await image.metadata();
      await image.stats(); // Decode the image, not just its header.
      const expectedFormat = mimeType.slice('image/'.length);
      if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
        throw new Error('Unexpected image format or dimensions');
      }
      return { width: metadata.width, height: metadata.height, format: metadata.format };
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

    let body: Uint8Array | null;
    try {
      body = await this.storagePort.getObjectLimited(evidence.objectKey, this.maxEvidenceBytes);
    } catch (error) {
      if (error instanceof ObjectTooLargeError) {
        throw new AppError(400, 'FILE_TOO_LARGE', 'El archivo subido excede el límite permitido');
      }
      throw error;
    }
    if (!body) {
      throw new AppError(
        400,
        'UPLOAD_NOT_FOUND',
        'El archivo no fue encontrado en el almacenamiento',
      );
    }

    const mimeType = head.mimeType || evidence.mimeType;
    const image = await this.validateImage(
      body,
      mimeType,
      ['image/jpeg', 'image/png', 'image/webp'],
      this.maxEvidenceBytes,
    );
    const expectedFormat = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[
      mimeType
    ];
    if (!expectedFormat || image.format !== expectedFormat) {
      throw new AppError(400, 'INVALID_IMAGE', 'El contenido no coincide con el tipo de imagen');
    }
    if (
      (input.width !== undefined && input.width !== image.width) ||
      (input.height !== undefined && input.height !== image.height)
    ) {
      throw new AppError(
        400,
        'IMAGE_DIMENSIONS_MISMATCH',
        'Las dimensiones no coinciden con la imagen',
      );
    }

    const checksum = createHash('sha256').update(body).digest('hex');
    if (input.checksum !== undefined && input.checksum !== checksum) {
      throw new AppError(400, 'CHECKSUM_MISMATCH', 'El checksum no coincide con el archivo');
    }
    return this.prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        status: UploadStatus.COMPLETED,
        completedAt: new Date(),
        sizeBytes: body.byteLength,
        mimeType,
        checksum,
        width: image.width,
        height: image.height,
      },
    });
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
}
