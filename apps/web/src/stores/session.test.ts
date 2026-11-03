import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@puk/contracts';

import { useSessionStore } from './session';
import {
  fetchCurrentSessionUser,
  refreshSession,
} from '@/shared/http/client';

vi.mock('@/shared/http/client', async () => {
  const actual = await vi.importActual<typeof import('@/shared/http/client')>('@/shared/http/client');
  return {
    ...actual,
    fetchCurrentSessionUser: vi.fn(),
    refreshSession: vi.fn(),
    isUnauthorizedHttpError: vi.fn(
      (err: unknown) => Boolean(err && typeof err === 'object' && 'response' in err && (err as { response?: { status?: number } }).response?.status === 401),
    ),
  };
});

const mockUser: SessionUser = {
  active: true,
  email: 'admin@example.invalid',
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Admin',
  role: 'ADMIN',
  orderAccessMode: 'INDIVIDUAL',
  technicianId: null,
};

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('keeps the access token in memory and clears the session', () => {
    const session = useSessionStore();

    session.acceptSession('access-token', mockUser);
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBe('access-token');
    expect(session.user?.role).toBe('ADMIN');

    session.clearSession();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
  });

  it('silently refreshes session during identity revalidation if access token expired (401)', async () => {
    const session = useSessionStore();
    session.acceptSession('expired-token', mockUser);

    const unauthorizedError = { response: { status: 401 } };
    vi.mocked(fetchCurrentSessionUser).mockRejectedValueOnce(unauthorizedError);

    const refreshedUser: SessionUser = { ...mockUser, name: 'Refreshed Admin' };
    vi.mocked(refreshSession).mockImplementationOnce(async () => {
      session.acceptSession('new-refreshed-token', refreshedUser);
    });

    const user = await session.revalidateIdentity({ force: true });

    expect(fetchCurrentSessionUser).toHaveBeenCalledWith('expired-token');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(user).toEqual(refreshedUser);
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBe('new-refreshed-token');
  });

  it('clears session when identity revalidation 401 and refresh also fails', async () => {
    const session = useSessionStore();
    session.acceptSession('expired-token', mockUser);

    const unauthorizedError = { response: { status: 401 } };
    vi.mocked(fetchCurrentSessionUser).mockRejectedValueOnce(unauthorizedError);
    vi.mocked(refreshSession).mockRejectedValueOnce(new Error('Refresh cookie expired'));

    const user = await session.revalidateIdentity({ force: true });

    expect(fetchCurrentSessionUser).toHaveBeenCalledWith('expired-token');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(user).toBeNull();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
  });
});
