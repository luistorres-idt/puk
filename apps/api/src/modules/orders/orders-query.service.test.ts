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

describe('order query pagination and date guard', () => {
  const actor = { id: 'admin-1', role: 'ADMIN' as const };
  it('uses page 1 and pageSize 25 defaults', async () => {
    const { prisma, service } = createService();
    const result = await service.listOrders(actor, {});
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
  });
  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: NaN },
    { page: Infinity },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: 1.5 },
    { pageSize: NaN },
    { page: Number.MAX_SAFE_INTEGER, pageSize: 100 },
    { page: Number.MAX_SAFE_INTEGER },
    { page: 4294967297, pageSize: 1 },
    { page: 42949674, pageSize: 100 },
    { page: 171798693 },
    { page: Number.MAX_SAFE_INTEGER, pageSize: 1 },
    { from: '2026-02-30' },
    { to: 'not-a-date' },
    { from: '2026-01-02', to: '2026-01-01' },
  ])('rejects invalid decoded query %# before Prisma', async (query) => {
    const { prisma, service } = createService();
    await expect(service.listOrders(actor, query)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(prisma.order.count).not.toHaveBeenCalled();
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
  it.each([
    { query: { from: '2024-02-29' }, expected: { gte: new Date('2024-02-29T00:00:00.000Z') } },
    { query: { to: '2026-01-01' }, expected: { lte: new Date('2026-01-01T00:00:00.000Z') } },
    {
      query: { from: '2026-01-01', to: '2026-01-01' },
      expected: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-01T00:00:00.000Z'),
      },
    },
    {
      query: { from: '2026-01-01T00:00:00-07:00', to: '2026-01-01T07:00:00Z' },
      expected: {
        gte: new Date('2026-01-01T07:00:00.000Z'),
        lte: new Date('2026-01-01T07:00:00.000Z'),
      },
    },
  ])('builds inclusive filters at the exact parsed instant %#', async ({ query, expected }) => {
    const { prisma, service } = createService();
    await service.listOrders(actor, query);
    expect(prisma.order.count).toHaveBeenCalledExactlyOnceWith({
      where: { scheduledAt: expected },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scheduledAt: expected } }),
    );
  });
  it('passes valid pagination without clamping', async () => {
    const { prisma, service } = createService();
    await service.listOrders(actor, { page: 2, pageSize: 100 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 100 }),
    );
  });
  it('passes the verified maximum offset intact without an Int32 cap', async () => {
    const { prisma, service } = createService();
    await service.listOrders(actor, { page: 4294967296, pageSize: 1 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 4294967295, take: 1 }),
    );
  });
});
