import type { SessionUser } from '@puk/contracts';
import { computed, shallowRef } from 'vue';
import { defineStore } from 'pinia';

import { api, configureHttpAuth, refreshSession } from '@/shared/http/client';

export const useSessionStore = defineStore('session', () => {
  const accessToken = shallowRef<string | null>(null);
  const user = shallowRef<SessionUser | null>(null);
  const initialized = shallowRef(false);
  const isAuthenticated = computed(() => accessToken.value !== null);

  function acceptSession(token: string, sessionUser: SessionUser): void {
    accessToken.value = token;
    user.value = sessionUser;
  }

  function clearSession(): void {
    accessToken.value = null;
    user.value = null;
  }

  configureHttpAuth({
    acceptSession,
    clearSession,
    getAccessToken: () => accessToken.value,
  });

  async function initialize(): Promise<void> {
    if (initialized.value) return;
    try {
      await refreshSession();
    } catch {
      clearSession();
    } finally {
      initialized.value = true;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const response = await api.post<{ data: { accessToken: string; user: SessionUser } }>(
      '/auth/login',
      { email, password },
    );
    acceptSession(response.data.data.accessToken, response.data.data.user);
    initialized.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      clearSession();
      initialized.value = true;
    }
  }

  return {
    accessToken,
    acceptSession,
    clearSession,
    initialize,
    initialized,
    isAuthenticated,
    login,
    logout,
    user,
  };
});
