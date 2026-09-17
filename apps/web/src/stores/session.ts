import type { SessionUser } from '@puk/contracts';
import { computed, shallowRef } from 'vue';
import { defineStore } from 'pinia';

import {
  api,
  configureHttpAuth,
  fetchCurrentSessionUser,
  isUnauthorizedHttpError,
  refreshSession,
} from '@/shared/http/client';

export const IDENTITY_REVALIDATION_TTL_MS = 30_000;

export interface RevalidateIdentityOptions {
  force?: boolean;
}

export const useSessionStore = defineStore('session', () => {
  const accessToken = shallowRef<string | null>(null);
  const user = shallowRef<SessionUser | null>(null);
  const initialized = shallowRef(false);
  const isAuthenticated = computed(() => accessToken.value !== null);
  let lastIdentityValidationAt = 0;
  let identityValidation:
    | { promise: Promise<SessionUser | null>; token: string }
    | undefined;

  function acceptSession(token: string, sessionUser: SessionUser): void {
    accessToken.value = token;
    user.value = sessionUser;
    lastIdentityValidationAt = Date.now();
  }

  function clearSession(): void {
    accessToken.value = null;
    user.value = null;
    lastIdentityValidationAt = 0;
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

  function revalidateIdentity(
    options: RevalidateIdentityOptions = {},
  ): Promise<SessionUser | null> {
    const token = accessToken.value;
    if (token === null) return Promise.resolve(null);

    if (identityValidation?.token === token) return identityValidation.promise;

    if (
      options.force !== true &&
      user.value !== null &&
      Date.now() - lastIdentityValidationAt < IDENTITY_REVALIDATION_TTL_MS
    ) {
      return Promise.resolve(user.value);
    }

    const validation = {
      token,
      promise: Promise.resolve<SessionUser | null>(null),
    };
    validation.promise = fetchCurrentSessionUser(token)
      .then((currentUser) => {
        if (accessToken.value !== token) return user.value;
        user.value = currentUser;
        lastIdentityValidationAt = Date.now();
        return currentUser;
      })
      .catch((error: unknown) => {
        if (!isUnauthorizedHttpError(error)) throw error;
        if (accessToken.value === token) clearSession();
        return null;
      })
      .finally(() => {
        if (identityValidation === validation) identityValidation = undefined;
      });
    identityValidation = validation;
    return validation.promise;
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
    revalidateIdentity,
    user,
  };
});
