import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/http/client.js';
import { createAdmin, listAdmins } from './api.js';

vi.mock('@/shared/http/client.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const admin = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  active: true,
  technicianId: null,
};

describe('admin users API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters the shared user endpoint to admins', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: {
        data: [admin, { ...admin, id: '00000000-0000-4000-8000-000000000002', role: 'TECHNICIAN' }],
      },
    } as never);

    await expect(listAdmins()).resolves.toEqual([admin]);
    expect(api.get).toHaveBeenCalledWith('/users');
  });

  it('always creates a user with the fixed ADMIN role', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: admin } } as never);

    await createAdmin({ name: 'Admin', email: 'admin@example.com', password: 'a-secure-password' });

    expect(api.post).toHaveBeenCalledWith('/users', {
      name: 'Admin',
      email: 'admin@example.com',
      password: 'a-secure-password',
      role: 'ADMIN',
    });
  });
});
