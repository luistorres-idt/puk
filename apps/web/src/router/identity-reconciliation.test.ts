import { describe, expect, it, vi } from 'vitest';

import {
  installIdentityFocusRevalidation,
  reconcileCurrentSessionAccess,
} from './identity-reconciliation';
import type { SessionAccessRoute } from './session-access';

const sharedUser = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Shared Tech',
  email: 'shared@example.com',
  role: 'TECHNICIAN' as const,
  orderAccessMode: 'SHARED' as const,
  active: true,
  technicianId: null,
};

const individualUser = {
  ...sharedUser,
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  orderAccessMode: 'INDIVIDUAL' as const,
};

function route(name: string, fullPath = `/${name}`): SessionAccessRoute {
  return { fullPath, meta: {}, name };
}

describe('identity reconciliation', () => {
  it('moves a newly shared session to the shared work board', async () => {
    const session = { revalidateIdentity: vi.fn().mockResolvedValue(sharedUser) };
    const router = {
      currentRoute: { value: route('home', '/') },
      replace: vi.fn().mockResolvedValue(undefined),
    };

    await expect(reconcileCurrentSessionAccess(session, router)).resolves.toBe(true);
    expect(session.revalidateIdentity).toHaveBeenCalledWith({ force: true });
    expect(router.replace).toHaveBeenCalledWith({ name: 'work-order' });
  });

  it('moves a no-longer-shared session away from the shared board', async () => {
    const session = { revalidateIdentity: vi.fn().mockResolvedValue(individualUser) };
    const router = {
      currentRoute: { value: route('work-order') },
      replace: vi.fn().mockResolvedValue(undefined),
    };

    await expect(reconcileCurrentSessionAccess(session, router)).resolves.toBe(true);
    expect(router.replace).toHaveBeenCalledWith({ name: 'home' });
  });

  it('sends a revoked session to login', async () => {
    const session = { revalidateIdentity: vi.fn().mockResolvedValue(null) };
    const router = {
      currentRoute: { value: route('work-order', '/work-order') },
      replace: vi.fn().mockResolvedValue(undefined),
    };

    await expect(reconcileCurrentSessionAccess(session, router)).resolves.toBe(true);
    expect(router.replace).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/work-order' },
    });
  });

  it('revalidates on focus and supports cleanup', async () => {
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: vi.fn((type: string, listener: () => void) =>
        listeners.set(type, listener),
      ),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    const session = { revalidateIdentity: vi.fn().mockResolvedValue(individualUser) };
    const router = {
      currentRoute: { value: route('home') },
      replace: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = installIdentityFocusRevalidation(target, session, router);
    listeners.get('focus')?.();
    await vi.waitFor(() =>
      expect(session.revalidateIdentity).toHaveBeenCalledWith({ force: true }),
    );
    cleanup();

    expect(target.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });
});
