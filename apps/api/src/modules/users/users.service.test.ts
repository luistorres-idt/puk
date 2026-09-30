import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  it('revokes refresh sessions when an active user is deactivated', async () => {
    const existing = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'TECHNICIAN' as const,
      technicianId: null,
      active: true,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const transaction = {
      user: { update: vi.fn().mockResolvedValue({ ...existing, active: false }) },
      refreshSession: { updateMany },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    };
    const service = new UsersService(prisma as unknown as PrismaClient, 12);

    const result = await service.update('admin-1', 'user-1', { active: false });

    expect(result.active).toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      data: { revokedAt: expect.any(Date) },
      where: { userId: 'user-1', revokedAt: null },
    });
  });

  it('prevents deactivating the last active administrator', async () => {
    const admin = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN' as const,
      technicianId: null,
      active: true,
    };
    const transaction = {
      user: { count: vi.fn().mockResolvedValue(1), update: vi.fn() },
      refreshSession: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(admin) },
      $transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    };
    const service = new UsersService(prisma as unknown as PrismaClient, 12);

    await expect(service.update('other-admin', 'admin-1', { active: false })).rejects.toMatchObject(
      {
        code: 'LAST_ACTIVE_ADMIN',
        status: 400,
      },
    );
    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it('prevents an administrator from deactivating their own account', async () => {
    const admin = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN' as const,
      technicianId: null,
      active: true,
    };
    const transaction = {
      user: { count: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(admin) },
      $transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    };
    const service = new UsersService(prisma as unknown as PrismaClient, 12);

    await expect(service.update('admin-1', 'admin-1', { active: false })).rejects.toMatchObject({
      code: 'ADMIN_SELF_LOCKOUT',
      status: 400,
    });
    expect(transaction.user.count).not.toHaveBeenCalled();
    expect(transaction.user.update).not.toHaveBeenCalled();
  });
});
