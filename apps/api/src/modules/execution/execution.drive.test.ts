import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, UploadStatus } from '../../generated/prisma/client.js';
import type { GoogleDriveClient } from '../../integrations/google-drive/google-drive.client.js';
import type { DriveFolderResolver } from '../../integrations/google-drive/drive-folder-resolver.js';
import { ExecutionService } from './execution.service.js';

describe('ExecutionService Drive mode', () => {
  const events: string[] = [];
  const prisma = {
    order: { findUnique: vi.fn() },
    orderUnit: { findUnique: vi.fn() },
    checklist: { findUnique: vi.fn(), create: vi.fn() },
    checklistItem: { findUnique: vi.fn(), create: vi.fn() },
    evidence: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    signature: { upsert: vi.fn(), findUnique: vi.fn() },
    driveSignatureUpload: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  const drive = {
    generateId: vi.fn(),
    uploadFile: vi.fn(),
    getFile: vi.fn(),
    deleteFile: vi.fn(),
  };
  const folders = {
    ensureEvidenceFolder: vi.fn(),
    ensureSharedOrderFolder: vi.fn(),
  };
  let service: ExecutionService;
  let jpeg: Buffer;
  let png: Buffer;
  let reservedEvidence: Record<string, unknown> | null;
  let signatureReservations: Map<string, Record<string, unknown>>;
  let currentSignature: Record<string, unknown> | null;

  beforeEach(async () => {
    vi.resetAllMocks();
    events.length = 0;
    reservedEvidence = null;
    signatureReservations = new Map();
    currentSignature = null;
    jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
      .jpeg()
      .toBuffer();
    png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.IN_PROGRESS,
      technicianId: 'tech-1',
      clientSheetId: 'client-1',
      clientNameSnapshot: 'Client One',
      folio: 'OS-1',
    });
    prisma.orderUnit.findUnique.mockResolvedValue({
      id: 'unit-1',
      orderId: 'order-1',
      serialNumber: 'VIN-123',
    });
    prisma.checklist.findUnique.mockResolvedValue({ id: 'checklist-1' });
    prisma.checklistItem.findUnique.mockResolvedValue({ id: 'item-1' });
    folders.ensureEvidenceFolder.mockResolvedValue('evidence-folder');
    folders.ensureSharedOrderFolder.mockResolvedValue('shared-folder');
    drive.uploadFile.mockImplementation(async () => {
      events.push('drive-upload');
      return { id: 'drive-file-1' };
    });
    drive.deleteFile.mockResolvedValue(undefined);
    drive.generateId.mockResolvedValue('reserved-drive-id');
    prisma.evidence.findUnique.mockImplementation(async () => reservedEvidence);
    prisma.evidence.findUniqueOrThrow.mockImplementation(async () => reservedEvidence);
    prisma.evidence.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        events.push('db-reserve');
        reservedEvidence = { ...data, deletedAt: null };
        return reservedEvidence;
      },
    );
    prisma.evidence.updateMany.mockImplementation(async () => {
      events.push('db-complete');
      reservedEvidence = { ...reservedEvidence, status: UploadStatus.COMPLETED };
      return { count: 1 };
    });
    prisma.$transaction.mockImplementation(
      async (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma),
    );
    prisma.driveSignatureUpload.findUnique.mockImplementation(
      async ({ where }: { where: { idempotencyKey: string } }) =>
        signatureReservations.get(where.idempotencyKey) ?? null,
    );
    prisma.driveSignatureUpload.findUniqueOrThrow.mockImplementation(
      async ({ where }: { where: { idempotencyKey: string } }) =>
        signatureReservations.get(where.idempotencyKey),
    );
    prisma.driveSignatureUpload.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        events.push('db-signature-reserve');
        const reservation = { ...data, completedAt: null, previousObjectKey: null };
        signatureReservations.set(String(data.idempotencyKey), reservation);
        return reservation;
      },
    );
    prisma.driveSignatureUpload.update.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { idempotencyKey: string };
        data: Record<string, unknown>;
      }) => {
        const reservation = { ...signatureReservations.get(where.idempotencyKey), ...data };
        signatureReservations.set(where.idempotencyKey, reservation);
        return reservation;
      },
    );
    prisma.driveSignatureUpload.updateMany.mockResolvedValue({ count: 1 });
    prisma.driveSignatureUpload.findMany.mockResolvedValue([]);
    prisma.signature.findUnique.mockImplementation(async () => currentSignature);
    prisma.signature.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => {
        events.push('db-signature');
        currentSignature = { id: 'signature-1', ...create };
        return currentSignature;
      },
    );
    service = new ExecutionService(prisma as unknown as PrismaClient, {
      drive: {
        client: drive as unknown as GoogleDriveClient,
        folders: folders as unknown as DriveFolderResolver,
      },
    });
  });

  it('stores an evidence row as completed only after an authenticated Drive upload', async () => {
    const result = await service.uploadEvidenceFile(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      jpeg,
      'image/jpeg',
      { width: 2, height: 2 },
    );
    expect(events).toEqual(['db-reserve', 'drive-upload', 'db-complete']);
    expect(result).toMatchObject({
      objectKey: 'reserved-drive-id',
      status: UploadStatus.COMPLETED,
      width: 2,
      height: 2,
    });
    expect(prisma.evidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderUnitId: 'unit-1' }),
    });
    expect(prisma.evidence.create.mock.calls[0]?.[0].data).not.toHaveProperty('checklistItemId');
    expect(prisma.checklistItem.findUnique).not.toHaveBeenCalled();
    expect(drive.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: `evidencia-${result.id}.jpg` }),
    );
    expect(folders.ensureEvidenceFolder).toHaveBeenCalledWith({
      clientSheetId: 'client-1',
      clientNameSnapshot: 'Client One',
      serialNumber: 'VIN-123',
      orderId: 'order-1',
      folio: 'OS-1',
    });
  });

  it('rejects a unit from another order before any Drive write', async () => {
    prisma.orderUnit.findUnique.mockResolvedValue({ id: 'unit-1', orderId: 'other-order' });
    await expect(
      service.uploadEvidenceFile('admin-1', 'ADMIN', 'order-1', 'unit-1', jpeg, 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'UNIT_NOT_FOUND' });
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects MIME spoofing, invalid image bytes, dimensions, and oversize input', async () => {
    await expect(
      service.uploadEvidenceFile('admin-1', 'ADMIN', 'order-1', 'unit-1', png, 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        Buffer.from('bad'),
        'image/png',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(
      service.uploadEvidenceFile('admin-1', 'ADMIN', 'order-1', 'unit-1', jpeg, 'image/jpeg', {
        width: 9,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_MISMATCH' });
    await expect(
      service.uploadEvidenceFile('admin-1', 'ADMIN', 'order-1', 'unit-1', jpeg, 'image/jpeg', {
        height: 9,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_MISMATCH' });
    const smallLimit = new ExecutionService(
      prisma as unknown as PrismaClient,
      {
        maxEvidenceBytes: 1,
        drive: {
          client: drive as unknown as GoogleDriveClient,
          folders: folders as unknown as DriveFolderResolver,
        },
      },
    );
    await expect(
      smallLimit.uploadEvidenceFile('admin-1', 'ADMIN', 'order-1', 'unit-1', jpeg, 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects a PNG claiming more than 40 million decoded pixels', async () => {
    const oversizedHeader = Buffer.from(png);
    oversizedHeader.writeUInt32BE(8_000, 16);
    oversizedHeader.writeUInt32BE(6_000, 20);
    oversizedHeader.writeUInt32BE(crc32(oversizedHeader.subarray(12, 29)), 29);
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        oversizedHeader,
        'image/png',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(drive.uploadFile).not.toHaveBeenCalled();
  });

  it('keeps the reservation on Drive or DB failure so a retry uses the same file ID', async () => {
    const retryKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    drive.uploadFile.mockRejectedValueOnce(new Error('Drive unavailable'));
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        jpeg,
        'image/jpeg',
        undefined,
        retryKey,
      ),
    ).rejects.toThrow('Drive unavailable');
    expect(prisma.evidence.create).toHaveBeenCalledOnce();
    prisma.evidence.updateMany.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        jpeg,
        'image/jpeg',
        undefined,
        retryKey,
      ),
    ).rejects.toThrow('Database unavailable');
    expect(prisma.evidence.create).toHaveBeenCalledOnce();
    expect(drive.uploadFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'reserved-drive-id' }),
    );
    expect(drive.deleteFile).not.toHaveBeenCalled();
    await service.uploadEvidenceFile(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      jpeg,
      'image/jpeg',
      undefined,
      retryKey,
    );
    expect(prisma.evidence.create).toHaveBeenCalledOnce();
    expect(drive.generateId).toHaveBeenCalledOnce();
  });

  it('returns an already completed evidence without another Drive upload and rejects key reuse with different bytes', async () => {
    const retryKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    const args = [
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      jpeg,
      'image/jpeg',
      undefined,
      retryKey,
    ] as const;
    const first = await service.uploadEvidenceFile(...args);
    const second = await service.uploadEvidenceFile(...args);
    expect(second).toEqual(first);
    expect(drive.uploadFile).toHaveBeenCalledOnce();
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        png,
        'image/png',
        undefined,
        retryKey,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('reconciles a file uploaded before a crash and rejects remote bytes that differ', async () => {
    const retryKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    drive.uploadFile.mockResolvedValue({ id: 'reserved-drive-id', reused: true });
    drive.getFile.mockResolvedValue(jpeg);
    await service.uploadEvidenceFile(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      jpeg,
      'image/jpeg',
      undefined,
      retryKey,
    );
    expect(prisma.evidence.updateMany).toHaveBeenCalledOnce();

    reservedEvidence = { ...reservedEvidence, status: UploadStatus.PENDING };
    drive.getFile.mockResolvedValue(png);
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        jpeg,
        'image/jpeg',
        undefined,
        retryKey,
      ),
    ).rejects.toMatchObject({ code: 'DRIVE_FILE_MISMATCH' });
  });

  it('recovers a concurrent evidence reservation through its unique retry key', async () => {
    const retryKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    await service.uploadEvidenceFile(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      jpeg,
      'image/jpeg',
      undefined,
      retryKey,
    );
    reservedEvidence = { ...reservedEvidence, status: UploadStatus.PENDING };
    prisma.evidence.findUnique.mockResolvedValueOnce(null);
    prisma.evidence.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    drive.uploadFile.mockResolvedValueOnce({ id: 'reserved-drive-id', reused: true });
    drive.getFile.mockResolvedValue(jpeg);
    await expect(
      service.uploadEvidenceFile(
        'admin-1',
        'ADMIN',
        'order-1',
        'unit-1',
        jpeg,
        'image/jpeg',
        undefined,
        retryKey,
      ),
    ).resolves.toMatchObject({ status: UploadStatus.COMPLETED });
    expect(drive.uploadFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'reserved-drive-id' }),
    );
  });

  it('stores a PNG signature in the shared order folder after upload', async () => {
    const result = await service.uploadSignatureFile(
      'admin-1',
      'ADMIN',
      'order-1',
      png,
      '  Client  ',
    );
    expect(events).toEqual(['db-signature-reserve', 'drive-upload', 'db-signature']);
    expect(result).toMatchObject({ objectKey: 'reserved-drive-id', signerName: 'Client' });
    expect(folders.ensureSharedOrderFolder).toHaveBeenCalledWith({
      clientSheetId: 'client-1',
      clientNameSnapshot: 'Client One',
      orderId: 'order-1',
      folio: 'OS-1',
    });
    expect(drive.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'shared-folder',
        mimeType: 'image/png',
        body: png,
      }),
    );
  });

  it('retries a signature with the same reservation after a DB failure', async () => {
    const retryKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    prisma.$transaction.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(
      service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', retryKey),
    ).rejects.toThrow('Database unavailable');
    expect(drive.deleteFile).not.toHaveBeenCalled();
    drive.uploadFile.mockResolvedValueOnce({ id: 'reserved-drive-id', reused: true });
    drive.getFile.mockResolvedValue(png);
    const retried = await service.uploadSignatureFile(
      'admin-1',
      'ADMIN',
      'order-1',
      png,
      'Client',
      retryKey,
    );
    expect(retried).toMatchObject({ objectKey: 'reserved-drive-id' });
    expect(prisma.driveSignatureUpload.create).toHaveBeenCalledOnce();
    expect(drive.generateId).toHaveBeenCalledOnce();
    await service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', retryKey);
    expect(drive.uploadFile).toHaveBeenCalledTimes(2);
  });

  it('recovers a concurrent signature reservation through its unique retry key', async () => {
    const retryKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    await service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', retryKey);
    const reservation = signatureReservations.get(retryKey)!;
    signatureReservations.set(retryKey, { ...reservation, completedAt: null });
    prisma.driveSignatureUpload.findUnique.mockResolvedValueOnce(null);
    prisma.driveSignatureUpload.create.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    drive.uploadFile.mockResolvedValueOnce({ id: 'reserved-drive-id', reused: true });
    drive.getFile.mockResolvedValue(png);
    await expect(
      service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', retryKey),
    ).resolves.toMatchObject({ objectKey: 'reserved-drive-id' });
    expect(drive.generateId).toHaveBeenCalledTimes(2);
  });

  it('tracks the previous Drive signature without deleting it when replacing the DB pointer', async () => {
    const firstKey = '234edc7a-d596-4b6b-95e4-34107e78485f';
    const secondKey = '6427e152-c15d-44f4-99d2-f598990324bf';
    drive.generateId.mockResolvedValueOnce('first-file').mockResolvedValueOnce('second-file');
    await service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', firstKey);
    events.length = 0;
    await service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', secondKey);
    expect(events).toEqual(['db-signature-reserve', 'drive-upload', 'db-signature']);
    expect(signatureReservations.get(secondKey)?.previousObjectKey).toBe('first-file');
    expect(drive.deleteFile).not.toHaveBeenCalled();
    await expect(
      service.uploadSignatureFile('admin-1', 'ADMIN', 'order-1', png, 'Client', firstKey),
    ).rejects.toMatchObject({ code: 'SIGNATURE_SUPERSEDED' });
  });

  it('reads evidence and signature only through the authorized order', async () => {
    prisma.evidence.findUnique.mockResolvedValue({
      id: 'evidence-1',
      status: UploadStatus.COMPLETED,
      deletedAt: null,
      objectKey: 'drive-evidence',
      mimeType: 'image/jpeg',
      orderUnit: { order: { id: 'order-1' } },
    });
    prisma.signature.findUnique.mockResolvedValue({
      objectKey: 'drive-signature',
      mimeType: 'image/png',
      signerName: 'Client One',
    });
    drive.getFile.mockImplementation(async (id: string) => (id === 'drive-evidence' ? jpeg : png));
    await expect(service.getEvidenceFile('admin-1', 'ADMIN', 'evidence-1')).resolves.toEqual({
      body: jpeg,
      mimeType: 'image/jpeg',
    });
    await expect(service.getSignatureFile('admin-1', 'ADMIN', 'order-1')).resolves.toEqual({
      body: png,
      mimeType: 'image/png',
      signerName: 'Client One',
    });
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.getEvidenceFile('admin-1', 'ADMIN', 'evidence-1')).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
    expect(drive.getFile).toHaveBeenCalledTimes(2);
  });

});
