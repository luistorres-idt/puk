<script setup lang="ts">
import { NButton } from 'naive-ui';
import { useRouter } from 'vue-router';

import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const router = useRouter();

async function logout(): Promise<void> {
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div
        class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6"
      >
        <router-link class="text-sm font-semibold tracking-wide text-blue-900 uppercase" to="/">
          Bull Dog Solution
        </router-link>
        <nav v-if="session.user" class="flex items-center gap-3">
          <router-link
            class="text-sm text-slate-700 hover:text-blue-800"
            to="/orders"
          >
            Órdenes
          </router-link>
          <router-link
            v-if="session.user.role === 'ADMIN'"
            class="text-sm text-slate-700 hover:text-blue-800"
            to="/technicians"
          >
            Técnicos
          </router-link>
          <span class="hidden text-sm text-slate-500 sm:inline">{{ session.user.name }}</span>
          <n-button quaternary size="small" @click="logout">Salir</n-button>
        </nav>
      </div>
    </header>
    <slot />
  </div>
</template>
