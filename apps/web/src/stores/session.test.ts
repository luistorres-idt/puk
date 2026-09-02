import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from './session';

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps the access token in memory and clears the session', () => {
    const session = useSessionStore();

    session.setAccessToken('access-token');
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBe('access-token');

    session.clearSession();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
  });
});
