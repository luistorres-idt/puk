import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let prisma: {
    order: { findUnique: ReturnType<typeof vi.fn>; findUniqueOrThrow: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
    serviceOrderReport: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    auditLog: { create: ReturnType<typeof vi.fn> };
  };
  let service: ReportsService;

  beforeEach(() => {
    prisma = {
      order: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
      user: { findUnique: vi.fn() },
      serviceOrderReport: { findFirst: vi.fn(), create: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    service = new ReportsService(prisma as unknown as PrismaClient);
  });

  it('creates version one for a completed order', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.COMPLETED,
      completedAt: new Date('2026-09-02T18:00:00.000Z'),
    });
    prisma.serviceOrderReport.findFirst.mockResolvedValue(null);
    prisma.serviceOrderReport.create.mockResolvedValue({
      id: 'report-1',
      orderId: 'order-1',
      version: 1,
      status: 'PENDING',
    });

    const result = await service.requestGeneration('order-1', 'admin-1');

    expect(result.version).toBe(1);
    expect(prisma.serviceOrderReport.create).toHaveBeenCalledWith({
      data: { orderId: 'order-1', version: 1 },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('blocks a technician assigned to a different order', async () => {
    prisma.order.findUnique.mockResolvedValue({ technicianId: 'tech-a' });
    prisma.user.findUnique.mockResolvedValue({ technicianId: 'tech-b' });

    await expect(service.getCurrent('order-1', 'user-b', 'TECHNICIAN')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    expect(prisma.serviceOrderReport.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a custom ReportGeneratorPort via dependency injection', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([1, 2, 3]),
        checksum: 'mock-checksum',
      }),
    };

    const customService = new ReportsService(
      prisma as unknown as PrismaClient,
      { generator: mockGenerator },
    );

    expect(customService).toBeDefined();
  });

  it('downloads a Drive report through the authenticated API without returning a Google URL', async () => {
    const client = {
      generateId: vi.fn(),
      headFile: vi.fn(),
      getFile: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])),
      uploadFile: vi.fn(),
    };
    const folders = { ensureSharedOrderFolder: vi.fn() };
    const driveService = new ReportsService(
      prisma as unknown as PrismaClient,
      { drive: { client, folders } },
    );
    prisma.order.findUnique.mockResolvedValue({ technicianId: null });
    prisma.order.findUniqueOrThrow = vi.fn().mockResolvedValue({ folio: 'OS-1' });
    prisma.serviceOrderReport.findFirst.mockResolvedValue({
      id: 'report-1',
      orderId: 'order-1',
      version: 1,
      status: 'READY',
      objectKey: 'drive-file-id',
    });

    await expect(driveService.getDownloadFile('order-1', 'admin-1', 'ADMIN')).resolves.toEqual({
      bytes: Uint8Array.from([1, 2, 3]),
      fileName: 'orden-servicio-OS-1-v1.pdf',
    });
    expect(client.getFile).toHaveBeenCalledWith('drive-file-id');
    await driveService.getDownloadFile('order-1', 'admin-1', 'ADMIN', 1);
    expect(prisma.serviceOrderReport.findFirst).toHaveBeenLastCalledWith({
      where: { orderId: 'order-1', version: 1 },
      orderBy: { version: 'desc' },
    });

  });
});

describe('ReportsService Drive upload retries', () => {
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49]);
  const order = {
    id: 'order-1',
    status: OrderStatus.COMPLETED,
    clientSheetId: 'client-1',
    clientNameSnapshot: 'Client',
    folio: 'OS-1',
    units: [],
  };

  function harness(existingFile = false) {
    const report: { id: string; orderId: string; version: number; objectKey: string | null } = {
      id: 'report-1',
      orderId: 'order-1',
      version: 1,
      objectKey: existingFile ? 'reserved-id' : null,
    };
    const prisma = {
      order: { findUniqueOrThrow: vi.fn().mockResolvedValue(order) },
      serviceOrderReport: {
        findUniqueOrThrow: vi.fn().mockImplementation(async () => ({ ...report })),
        updateMany: vi
          .fn()
          .mockImplementation(async ({ data }: { data: { objectKey: string } }) => {
            report.objectKey ??= data.objectKey;
            return { count: 1 };
          }),
        update: vi.fn().mockResolvedValue({}),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi
        .fn()
        .mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const client = {
      generateId: vi.fn().mockResolvedValue('reserved-id'),
      headFile: vi.fn().mockResolvedValue(
        existingFile
          ? {
              id: 'reserved-id',
              name: 'reporte-v1.pdf',
              parentId: 'shared-folder',
              mimeType: 'application/pdf',
            }
          : null,
      ),
      uploadFile: vi.fn().mockResolvedValue({ id: 'reserved-id' }),
      getFile: vi.fn().mockResolvedValue(bytes),
    };
    const generator = { generate: vi.fn().mockResolvedValue({ bytes, checksum: 'unused' }) };
    const folders = { ensureSharedOrderFolder: vi.fn().mockResolvedValue('shared-folder') };
    const service = new ReportsService(
      prisma as unknown as PrismaClient,
      { drive: { client, folders }, generator },
    );
    const generate = () =>
      (service as unknown as { generateReport(id: string): Promise<void> }).generateReport(
        report.id,
      );
    return { prisma, client, generator, generate, report };
  }

  it('persists the Drive file ID before upload and marks the report READY afterward', async () => {
    const { prisma, client, generate, report } = harness();
    await generate();
    expect(report.objectKey).toBe('reserved-id');
    expect(prisma.serviceOrderReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'report-1', objectKey: null },
      data: { objectKey: 'reserved-id' },
    });
    expect(client.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reserved-id', parentId: 'shared-folder', body: bytes }),
    );
    expect(prisma.serviceOrderReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          objectKey: 'reserved-id',
          checksum: createHash('sha256').update(bytes).digest('hex'),
        }),
      }),
    );
  });

  it('recovers an already uploaded PDF after a crash without generating or uploading another', async () => {
    const { client, generator, generate, prisma } = harness(true);
    await generate();
    expect(client.generateId).not.toHaveBeenCalled();
    expect(client.uploadFile).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
    expect(prisma.serviceOrderReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sizeBytes: bytes.byteLength,
          checksum: createHash('sha256').update(bytes).digest('hex'),
        }),
      }),
    );
  });

  it('reconciles a concurrent 409 upload using the actual remote PDF checksum', async () => {
    const { client, generate, prisma } = harness();
    client.uploadFile.mockResolvedValue({ id: 'reserved-id', reused: true });
    await generate();
    expect(client.getFile).toHaveBeenCalledWith('reserved-id');
    expect(prisma.serviceOrderReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checksum: createHash('sha256').update(bytes).digest('hex'),
        }),
      }),
    );
  });

  it('uses the persisted reservation winner instead of its own generated Drive ID', async () => {
    const { client, generate, prisma, report } = harness();
    client.generateId.mockResolvedValue('losing-id');
    prisma.serviceOrderReport.updateMany.mockImplementation(async () => {
      report.objectKey = 'winning-id';
      return { count: 0 };
    });

    await generate();

    expect(client.headFile).toHaveBeenCalledWith('winning-id');
    expect(client.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'winning-id' }));
    expect(prisma.serviceOrderReport.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ objectKey: 'winning-id' }) }),
    );
  });

  it('does not mark a report READY when a reused Drive file disappears during retry', async () => {
    const { client, generate, prisma } = harness(true);
    client.getFile.mockResolvedValue(null);

    await expect(generate()).rejects.toThrow('disappeared during retry');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a reserved ID that points to another Drive folder', async () => {
    const { client, generate, generator } = harness(true);
    client.headFile.mockResolvedValue({
      id: 'reserved-id',
      name: 'reporte-v1.pdf',
      parentId: 'other-folder',
      mimeType: 'application/pdf',
    });
    await expect(generate()).rejects.toThrow('belongs to a different file');
    expect(generator.generate).not.toHaveBeenCalled();
  });
});
