import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { MAX_IMAGE_PIXELS } from '@puk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { UploadStatus } from '../../generated/prisma/client.js';
import type { GoogleDriveClient } from '../../integrations/google-drive/google-drive.client.js';
import type { DriveFolderResolver } from '../../integrations/google-drive/drive-folder-resolver.js';
import { AppError } from '../../shared/errors.js';
import { assertCanExecuteWork } from '../orders/index.js';
import { loadAccessibleExecutionOrder } from './execution-order-access.js';

export interface ExecutionMediaOptions {
  drive?: { client: GoogleDriveClient; folders: DriveFolderResolver };
  maxEvidenceBytes?: number;
  maxSignatureBytes?: number;
}

export class ExecutionMediaService {
  private readonly drive: ExecutionMediaOptions['drive'];
  private readonly maxEvidenceBytes: number;
  private readonly maxSignatureBytes: number;

  public constructor(
    private readonly prisma: PrismaClient,
    options: ExecutionMediaOptions = {},
  ) {
    this.drive = options.drive;
    this.maxEvidenceBytes = options.maxEvidenceBytes ?? 10 * 1024 * 1024; // 10MB
    this.maxSignatureBytes = options.maxSignatureBytes ?? 1024 * 1024; // 1MB
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

}
