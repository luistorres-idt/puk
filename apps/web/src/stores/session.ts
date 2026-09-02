import { computed, shallowRef } from 'vue';
import { defineStore } from 'pinia';

export const useSessionStore = defineStore('session', () => {
  const accessToken = shallowRef<string | null>(null);
  const isAuthenticated = computed(() => accessToken.value !== null);

  function setAccessToken(token: string): void {
    accessToken.value = token;
  }

  function clearSession(): void {
    accessToken.value = null;
  }

  return {
    accessToken,
    clearSession,
    isAuthenticated,
    setAccessToken,
  };
});
