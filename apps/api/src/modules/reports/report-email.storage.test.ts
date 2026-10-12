import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ObjectStoragePort } from '../../integrations/ports.js';
import type { ReportDrivePort } from './report-storage.js';
import { ReportsService } from './reports.service.js';
function setup(drive = false) {
  const prisma = {
    order: { findUnique: vi.fn().mockResolvedValue({ status: 'COMPLETED', folio: 'OS-1' }) },
    serviceOrderReport: {
      findFirst: vi
        .fn()
        .mockResolvedValue({
          id: 'report-2',
          orderId: 'order-1',
          version: 2,
          status: 'READY',
          objectKey: 'stored-file',
        }),
    },
    auditLog: { create: vi.fn() },
  };
  const storage = { getObject: vi.fn().mockResolvedValue(Uint8Array.from([1, 2])) };
  const drivePort = { client: { getFile: vi.fn().mockResolvedValue(Uint8Array.from([3, 4])) } };
  const service = new ReportsService(
    prisma as unknown as PrismaClient,
    storage as unknown as ObjectStoragePort,
    drive ? { drive: drivePort as unknown as ReportDrivePort } : undefined,
  );
  return { prisma, storage, drivePort, service };
}
describe('storage-neutral report delivery reads', () => {
  it.each([false, true])(
    'reads exact requested READY version (Drive %s) without download audit',
    async (drive) => {
      const ctx = setup(drive);
      const file = await ctx.service.readReadyPdfForDelivery('order-1', 'report-2');
      expect(file).toMatchObject({
        reportId: 'report-2',
        version: 2,
        fileName: 'orden-servicio-OS-1-v2.pdf',
        bytes: drive ? Uint8Array.from([3, 4]) : Uint8Array.from([1, 2]),
      });
      expect(ctx.prisma.serviceOrderReport.findFirst).toHaveBeenCalledWith({
        where: { id: 'report-2', orderId: 'order-1' },
      });
      expect(ctx.prisma.auditLog.create).not.toHaveBeenCalled();
      expect(drive ? ctx.storage.getObject : ctx.drivePort.client.getFile).not.toHaveBeenCalled();
    },
  );
  it('rejects non-completed, missing, unready and missing-file cases', async () => {
    const ctx = setup();
    ctx.prisma.order.findUnique.mockResolvedValueOnce({ status: 'IN_PROGRESS' } as never);
    await expect(ctx.service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'ORDER_NOT_COMPLETED',
    });
    ctx.prisma.serviceOrderReport.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      ctx.service.readReadyPdfForDelivery('order-1', 'foreign-report'),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' });
    ctx.prisma.serviceOrderReport.findFirst.mockResolvedValueOnce({ status: 'PENDING' } as never);
    await expect(ctx.service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'REPORT_NOT_READY',
    });
    ctx.storage.getObject.mockResolvedValueOnce(null as never);
    await expect(ctx.service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'REPORT_FILE_NOT_FOUND',
    });
  });
});
