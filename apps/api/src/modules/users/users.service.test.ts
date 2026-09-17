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
});
