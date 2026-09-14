<script setup lang="ts">
import { NButton, NTag } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useOnline } from '@vueuse/core';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const router = useRouter();
const isOnline = useOnline();

async function logout(): Promise<void> {
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-slate-50 text-slate-800">
    <!-- Offline disclaimer banner -->
    <div
      v-if="!isOnline"
      class="bg-amber-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-inner"
      role="alert"
    >
      Sin conexión a internet. Este sistema requiere conexión activa para registrar, guardar y
      sincronizar órdenes.
    </div>

    <!-- Header navigation -->
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div
        class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6"
      >
        <div class="flex items-center gap-3">
          <router-link
            class="flex items-center gap-2 text-sm font-bold tracking-tight text-blue-900 uppercase hover:text-blue-700"
            :to="session.user?.orderAccessMode === 'SHARED' ? '/work-order' : '/'"
          >
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-900 text-xs font-black text-white"
            >
              B
            </div>
            <span>Bull Dog Solution</span>
          </router-link>

          <n-tag
            v-if="session.user"
            size="small"
            :type="session.user.role === 'ADMIN' ? 'primary' : 'info'"
            round
          >
            {{
              session.user.role === 'ADMIN'
                ? 'Admin'
                : session.user.orderAccessMode === 'SHARED'
                  ? 'Técnico Compartido'
                  : 'Técnico'
            }}
          </n-tag>
        </div>

        <nav v-if="session.user" class="flex items-center gap-2 sm:gap-4">
          <template v-if="session.user.orderAccessMode === 'SHARED'">
            <router-link
              class="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
              to="/work-order"
            >
              Orden de Trabajo
            </router-link>
          </template>
          <template v-else>
            <router-link
              class="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
              to="/"
            >
              Inicio
            </router-link>
            <router-link
              class="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
              to="/orders"
            >
              {{ session.user.role === 'ADMIN' ? 'Órdenes' : 'Mis Órdenes' }}
            </router-link>
            <router-link
              v-if="session.user.role === 'ADMIN'"
              class="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
              to="/technicians"
            >
              Técnicos
            </router-link>
            <router-link
              v-if="session.user.role === 'ADMIN'"
              class="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
              to="/technical-accounts"
            >
              Cuentas Técnicas
            </router-link>
            <router-link
              v-if="session.user.role === 'ADMIN'"
              class="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
              to="/sync"
            >
              Sincronización
            </router-link>
          </template>

          <span class="hidden text-xs text-slate-500 md:inline">
            {{ session.user.name }}
          </span>

          <n-button quaternary size="small" @click="logout"> Salir </n-button>
        </nav>
      </div>
    </header>

    <!-- Main content slot -->
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-400">
      Bull Dog Solution &bull; Conexión en línea requerida para operaciones
    </footer>
  </div>
</template>
