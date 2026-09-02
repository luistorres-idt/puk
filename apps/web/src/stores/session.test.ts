import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from './session';

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps the access token in memory and clears the session', () => {
    const session = useSessionStore();

    session.acceptSession('access-token', {
      active: true,
      email: 'admin@example.invalid',
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Admin',
      role: 'ADMIN',
      technicianId: null,
    });
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBe('access-token');
    expect(session.user?.role).toBe('ADMIN');

    session.clearSession();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
  });
});
