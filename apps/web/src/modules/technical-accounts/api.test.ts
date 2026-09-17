import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminUser,
  getSharedTechnicianAccess,
  listAdminUsers,
  updateAdminUser,
  updateSharedTechnicianAccount,
  updateSharedTechnicianOrder,
} from './api.js';
import { api } from '../../shared/http/client.js';

vi.mock('../../shared/http/client.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

const response = <T>(data: T) => ({ data: { data } });

const sharedAccess = {
  id: 1 as const,
  userId: '00000000-0000-4000-8000-000000000001',
  orderId: null,
  revision: 3,
  updatedAt: '2026-09-15T00:00:00.000Z',
};

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Technical User',
  email: 'technical@example.com',
  role: 'TECHNICIAN' as const,
  active: true,
  technicianId: null,
};

describe('technical accounts API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps shared access and user administration endpoints in their domain module', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(response(sharedAccess) as never);
    vi.mocked(api.put).mockResolvedValueOnce(response(sharedAccess) as never);
    vi.mocked(api.put).mockResolvedValueOnce(response(sharedAccess) as never);
    vi.mocked(api.get).mockResolvedValueOnce(response([user]) as never);
    vi.mocked(api.post).mockResolvedValueOnce(response(user) as never);
    vi.mocked(api.patch).mockResolvedValueOnce(response(user) as never);

    await expect(getSharedTechnicianAccess()).resolves.toEqual(sharedAccess);
    await expect(
      updateSharedTechnicianAccount({ expectedRevision: 3, userId: sharedAccess.userId }),
    ).resolves.toEqual(sharedAccess);
    await expect(
      updateSharedTechnicianOrder({ expectedRevision: 3, orderId: null }),
    ).resolves.toEqual(sharedAccess);
    await expect(listAdminUsers()).resolves.toEqual([user]);
    await expect(
      createAdminUser({
        email: user.email,
        name: user.name,
        password: 'a-secure-password',
        role: user.role,
        technicianId: null,
      }),
    ).resolves.toEqual(user);
    await expect(updateAdminUser(user.id, { active: false })).resolves.toEqual(user);

    expect(api.get).toHaveBeenNthCalledWith(1, '/shared-technician-access');
    expect(api.put).toHaveBeenNthCalledWith(1, '/shared-technician-access/account', {
      expectedRevision: 3,
      userId: sharedAccess.userId,
    });
    expect(api.put).toHaveBeenNthCalledWith(2, '/shared-technician-access/order', {
      expectedRevision: 3,
      orderId: null,
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/users');
    expect(api.post).toHaveBeenCalledWith('/users', expect.objectContaining({ email: user.email }));
    expect(api.patch).toHaveBeenCalledWith(`/users/${user.id}`, { active: false });
  });
});
