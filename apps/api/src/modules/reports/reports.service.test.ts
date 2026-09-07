import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { DevMockStorageClient } from '../../integrations/object-storage/dev-mock-storage.client.js';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let prisma: {
    order: { findUnique: ReturnType<typeof vi.fn> };
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
      order: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      serviceOrderReport: { findFirst: vi.fn(), create: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    service = new ReportsService(prisma as unknown as PrismaClient, new DevMockStorageClient());
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
      new DevMockStorageClient(),
      { generator: mockGenerator },
    );

    expect(customService).toBeDefined();
  });
});
