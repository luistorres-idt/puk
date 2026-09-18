import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, UserRole } from '../../generated/prisma/client.js';
import { SharedTechnicianAccessService } from './shared-technician-access.service.js';

function createMockPrisma(state: {
  config?: {
    id: number;
    userId: string | null;
    orderId: string | null;
    revision: number;
    updatedAt: Date;
  };
  user?: { id: string; active: boolean; role: UserRole; technicianId: string | null } | null;
  order?: { id: string; status: OrderStatus; technicianId: string | null } | null;
}) {
  const currentConfig = state.config ?? {
    id: 1,
    userId: null,
    orderId: null,
    revision: 0,
    updatedAt: new Date('2026-09-14T12:00:00Z'),
  };

  const mockTx = {
    $queryRaw: vi.fn().mockResolvedValue([currentConfig]),
    sharedTechnicianAccess: {
      findUnique: vi.fn().mockResolvedValue(currentConfig),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const next = {
          ...currentConfig,
          userId: data.userId !== undefined ? data.userId : currentConfig.userId,
          orderId: data.orderId !== undefined ? data.orderId : currentConfig.orderId,
          revision: currentConfig.revision + 1,
          updatedAt: new Date('2026-09-14T12:05:00Z'),
        };
        return Promise.resolve(next);
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(state.user ?? null),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue(state.order ?? null),
    },
    auditLog: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    sheetSyncOperation: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const client = {
    ...mockTx,
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  };

  return { client: client as unknown as PrismaClient, mockTx };
}

describe('SharedTechnicianAccessService', () => {
  it('getConfig returns the singleton configuration', async () => {
    const { client } = createMockPrisma({
      config: {
        id: 1,
        userId: 'tech-user-1',
        orderId: 'order-1',
        revision: 2,
        updatedAt: new Date('2026-09-14T12:00:00Z'),
      },
    });
    const service = new SharedTechnicianAccessService(client);
    const config = await service.getConfig();

    expect(config).toEqual({
      id: 1,
      userId: 'tech-user-1',
      orderId: 'order-1',
      revision: 2,
      updatedAt: '2026-09-14T12:00:00.000Z',
    });
  });

  describe('updateAccount', () => {
    it('locks with SELECT FOR UPDATE and successfully designates a valid technician account', async () => {
      const { client, mockTx } = createMockPrisma({
        config: {
          id: 1,
          userId: null,
          orderId: null,
          revision: 0,
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
        user: {
          id: 'user-tech-1',
          active: true,
          role: UserRole.TECHNICIAN,
          technicianId: null,
        },
      });
      const service = new SharedTechnicianAccessService(client);

      const result = await service.updateAccount('admin-1', {
        userId: 'user-tech-1',
        expectedRevision: 0,
      });

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(result.userId).toBe('user-tech-1');
      expect(result.revision).toBe(1);
      expect(mockTx.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            action: 'SHARED_TECHNICIAN_ACCOUNT_CHANGED',
            actorUserId: 'admin-1',
            entityType: 'SharedTechnicianAccess',
          }),
        ],
      });
    });

    it('rejects with 409 ORDER_ACCESS_CHANGED when revision does not match', async () => {
      const { client } = createMockPrisma({
        config: {
          id: 1,
          userId: null,
          orderId: null,
          revision: 3,
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
      });
      const service = new SharedTechnicianAccessService(client);

      await expect(
        service.updateAccount('admin-1', {
          userId: 'user-tech-1',
          expectedRevision: 2,
        }),
      ).rejects.toMatchObject({
        code: 'ORDER_ACCESS_CHANGED',
        status: 409,
      });
    });

    it('rejects with 400 INVALID_SHARED_TECHNICIAN_ACCOUNT when user has individual technicianId', async () => {
      const { client } = createMockPrisma({
        config: {
          id: 1,
          userId: null,
          orderId: null,
          revision: 0,
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
        user: {
          id: 'user-tech-1',
          active: true,
          role: UserRole.TECHNICIAN,
          technicianId: 'individual-tech-id',
        },
      });
      const service = new SharedTechnicianAccessService(client);

      await expect(
        service.updateAccount('admin-1', {
          userId: 'user-tech-1',
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_SHARED_TECHNICIAN_ACCOUNT',
        status: 400,
      });
    });
  });

  describe('updateOrder', () => {
    it('locks with SELECT FOR UPDATE and enables an eligible assigned order', async () => {
      const { client, mockTx } = createMockPrisma({
        config: {
          id: 1,
          userId: 'user-tech-1',
          orderId: null,
          revision: 1,
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
        order: {
          id: 'order-1',
          status: OrderStatus.ASSIGNED,
          technicianId: 'tech-real-1',
        },
      });
      const service = new SharedTechnicianAccessService(client);

      const result = await service.updateOrder('admin-1', {
        orderId: 'order-1',
        expectedRevision: 1,
      });

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(result.orderId).toBe('order-1');
      expect(result.revision).toBe(2);
      expect(mockTx.auditLog.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            action: 'SHARED_TECHNICIAN_ORDER_ENABLED',
            actorUserId: 'admin-1',
          }),
        ],
      });
    });

    it('rejects with 409 ORDER_NOT_ELIGIBLE_FOR_SHARED_ACCESS if no user account is designated', async () => {
      const { client } = createMockPrisma({
        config: {
          id: 1,
          userId: null,
          orderId: null,
          revision: 0,
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
        order: {
          id: 'order-1',
          status: OrderStatus.ASSIGNED,
          technicianId: 'tech-real-1',
        },
      });
      const service = new SharedTechnicianAccessService(client);

      await expect(
        service.updateOrder('admin-1', {
          orderId: 'order-1',
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({
        code: 'ORDER_NOT_ELIGIBLE_FOR_SHARED_ACCESS',
        status: 409,
      });
    });

    it('rejects with 409 ORDER_NOT_ELIGIBLE_FOR_SHARED_ACCESS if order status is COMPLETED', async () => {
      const { client } = createMockPrisma({
        config: {
          id: 1,
          userId: 'user-tech-1',
          orderId: null,
          revision: 1,
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
        order: {
          id: 'order-1',
          status: OrderStatus.COMPLETED,
          technicianId: 'tech-real-1',
        },
      });
      const service = new SharedTechnicianAccessService(client);

      await expect(
        service.updateOrder('admin-1', {
          orderId: 'order-1',
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({
        code: 'ORDER_NOT_ELIGIBLE_FOR_SHARED_ACCESS',
        status: 409,
      });
    });

    it('rejects with 409 ORDER_ACCESS_CHANGED when revision does not match (A -> B -> A prevention)', async () => {
      const { client } = createMockPrisma({
        config: {
          id: 1,
          userId: 'user-tech-1',
          orderId: 'order-a',
          revision: 3, // Changed from 1 -> 2 -> 3
          updatedAt: new Date('2026-09-14T12:00:00Z'),
        },
      });
      const service = new SharedTechnicianAccessService(client);

      await expect(
        service.updateOrder('admin-1', {
          orderId: 'order-a',
          expectedRevision: 1, // Client had cached revision 1
        }),
      ).rejects.toMatchObject({
        code: 'ORDER_ACCESS_CHANGED',
        status: 409,
      });
    });
  });
});
