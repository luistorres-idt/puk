import { describe, expect, it, vi } from 'vitest';

import { assertIndividualTechnician, assertOrderAccess } from './order-access-policy.js';

const assignedOrder = {
  id: 'order-1',
  status: 'ASSIGNED',
  technicianId: 'tech-1',
  technician: { id: 'tech-1' },
};

describe('shared technician order access policy', () => {
  it('denies an individual technician with no technician match', async () => {
    const prisma = mockPrisma({
      order: assignedOrder,
      shared: { userId: null, orderId: null },
      user: { active: true, technicianId: null },
    });

    await expect(
      assertOrderAccess(prisma, { id: 'user-1', role: 'TECHNICIAN' }, 'order-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows a designated shared technician for any eligible assigned order', async () => {
    const prisma = mockPrisma({
      order: assignedOrder,
      shared: { userId: 'shared-user', orderId: null },
      user: { active: true, technicianId: null },
    });

    await expect(
      assertOrderAccess(prisma, { id: 'shared-user', role: 'TECHNICIAN' }, 'order-1'),
    ).resolves.toMatchObject({ mode: 'SHARED' });
  });

  it('denies a designated shared technician if order has no technician assigned', async () => {
    const prisma = mockPrisma({
      order: { ...assignedOrder, technicianId: null },
      shared: { userId: 'shared-user', orderId: null },
      user: { active: true, technicianId: null },
    });

    await expect(
      assertOrderAccess(prisma, { id: 'shared-user', role: 'TECHNICIAN' }, 'order-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies a designated shared technician if order is in non-executable status', async () => {
    const prisma = mockPrisma({
      order: { ...assignedOrder, status: 'COMPLETED' },
      shared: { userId: 'shared-user', orderId: null },
      user: { active: true, technicianId: null },
    });

    await expect(
      assertOrderAccess(prisma, { id: 'shared-user', role: 'TECHNICIAN' }, 'order-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies reports and catalogs for a designated shared technician', async () => {
    const prisma = mockPrisma({
      order: assignedOrder,
      shared: { userId: 'shared-user', orderId: 'order-1' },
      user: { active: true, technicianId: null },
    });

    await expect(
      assertIndividualTechnician(prisma, { id: 'shared-user', role: 'TECHNICIAN' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies a technician with neither individual assignment nor shared access', async () => {
    const prisma = mockPrisma({
      order: assignedOrder,
      shared: { userId: null, orderId: null },
      user: { active: true, technicianId: null },
    });

    await expect(
      assertIndividualTechnician(prisma, { id: 'user-1', role: 'TECHNICIAN' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

function mockPrisma(state: { order: unknown; shared: unknown; user: unknown }) {
  return {
    order: { findUnique: vi.fn(async () => state.order) },
    sharedTechnicianAccess: { findUnique: vi.fn(async () => state.shared) },
    user: { findUnique: vi.fn(async () => state.user) },
  } as never;
}
