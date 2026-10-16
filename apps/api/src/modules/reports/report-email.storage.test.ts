import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ReportDrivePort } from './report-storage.js';
import { ReportsService } from './reports.service.js';

describe('Drive report delivery reads', () => {
  it('reads the exact READY report version through Drive without creating a download audit', async () => {
    const prisma = {
      order: { findUnique: vi.fn().mockResolvedValue({ status: 'COMPLETED', folio: 'OS-1' }) },
      serviceOrderReport: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'report-2',
          orderId: 'order-1',
          version: 2,
          status: 'READY',
          objectKey: 'drive-file-id',
        }),
      },
      auditLog: { create: vi.fn() },
    };
    const drive = {
      client: { getFile: vi.fn().mockResolvedValue(Uint8Array.from([3, 4])) },
    } as unknown as ReportDrivePort;
    const service = new ReportsService(prisma as unknown as PrismaClient, { drive });

    await expect(service.readReadyPdfForDelivery('order-1', 'report-2')).resolves.toMatchObject({
      reportId: 'report-2',
      version: 2,
      fileName: 'orden-servicio-OS-1-v2.pdf',
      bytes: Uint8Array.from([3, 4]),
    });
    expect(prisma.serviceOrderReport.findFirst).toHaveBeenCalledWith({
      where: { id: 'report-2', orderId: 'order-1' },
    });
    expect(drive.client.getFile).toHaveBeenCalledWith('drive-file-id');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects non-completed orders, absent reports, unready reports, and missing Drive files', async () => {
    const prisma = {
      order: { findUnique: vi.fn().mockResolvedValue({ status: 'IN_PROGRESS' }) },
      serviceOrderReport: { findFirst: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const drive = {
      client: { getFile: vi.fn().mockResolvedValue(null) },
    } as unknown as ReportDrivePort;
    const service = new ReportsService(prisma as unknown as PrismaClient, { drive });

    await expect(service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'ORDER_NOT_COMPLETED',
    });
    prisma.order.findUnique.mockResolvedValue({ status: 'COMPLETED', folio: 'OS-1' });
    prisma.serviceOrderReport.findFirst.mockResolvedValueOnce(null);
    await expect(service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    });
    prisma.serviceOrderReport.findFirst.mockResolvedValueOnce({ status: 'PENDING' });
    await expect(service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'REPORT_NOT_READY',
    });
    prisma.serviceOrderReport.findFirst.mockResolvedValueOnce({
      id: 'report-2',
      version: 2,
      status: 'READY',
      objectKey: 'drive-file-id',
    });
    await expect(service.readReadyPdfForDelivery('order-1', 'report-2')).rejects.toMatchObject({
      code: 'REPORT_FILE_NOT_FOUND',
    });
  });
});
