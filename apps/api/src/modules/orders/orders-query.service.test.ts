import { describe, expect, it, vi } from 'vitest';
import { OrderStatus, type PrismaClient } from '../../generated/prisma/client.js';
import { OrdersQueryService } from './orders-query.service.js';

function createService() {
  const prisma = {
    order: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    sharedTechnicianAccess: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new OrdersQueryService(prisma as unknown as PrismaClient) };
}

describe('OrdersQueryService', () => {
  it('does not query orders for a technician without an assigned account', async () => {
    const { prisma, service } = createService();
    prisma.sharedTechnicianAccess.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.listOrders({ id: 'user-1', role: 'TECHNICIAN' }, {})).resolves.toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
    });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.order.count).not.toHaveBeenCalled();
  });

  it('does not query an ineligible status for a shared technician', async () => {
    const { prisma, service } = createService();
    prisma.sharedTechnicianAccess.findUnique.mockResolvedValue({ userId: 'shared', orderId: null });

    await expect(
      service.listOrders({ id: 'shared', role: 'TECHNICIAN' }, { status: OrderStatus.DRAFT }),
    ).resolves.toMatchObject({ data: [], pagination: { total: 0 } });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('restricts administrative detail before loading an order', async () => {
    const { prisma, service } = createService();

    await expect(
      service.getOrderById('order-1', { id: 'user-1', role: 'TECHNICIAN' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  it('checks that an order exists before reading its audit log', async () => {
    const { prisma, service } = createService();
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.getOrderAuditLogs('missing')).rejects.toMatchObject({
      status: 404,
      code: 'ORDER_NOT_FOUND',
    });
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});
