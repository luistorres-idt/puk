<script setup lang="ts">
import { ref, watch } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { useRoute, useRouter } from 'vue-router';
import { useOnline } from '@vueuse/core';
import ThemeToggle from '@/shared/components/ThemeToggle.vue';
import { OnboardingHelp } from '@/modules/onboarding';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const router = useRouter();
const route = useRoute();
const isOnline = useOnline();
const isMobileMenuOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    isMobileMenuOpen.value = false;
  },
);

async function logout(): Promise<void> {
  isMobileMenuOpen.value = false;
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="app-shell flex min-h-screen flex-col bg-slate-50 text-slate-800">
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
    <header
      class="app-header sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm"
    >
      <div
        class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <router-link
            class="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight text-blue-900 uppercase hover:text-blue-700"
            :to="session.user?.orderAccessMode === 'SHARED' ? '/work-order' : '/'"
            @click="isMobileMenuOpen = false"
          >
            <div
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-900 text-xs font-black text-white"
            >
              B
            </div>
            <span class="truncate">Bull Dog Solution</span>
          </router-link>

          <n-tag
            v-if="session.user"
            size="small"
            :type="session.user.role === 'ADMIN' ? 'primary' : 'info'"
            round
            class="hidden sm:inline-flex"
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

        <div class="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <OnboardingHelp />

          <!-- Desktop Navigation -->
          <nav
            v-if="session.user"
            data-tour="navigation"
            aria-label="Navegación principal"
            class="hidden items-center gap-2 2xl:flex lg:gap-4"
          >
            <template v-if="session.user.orderAccessMode === 'SHARED'">
              <router-link
                class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/work-order"
              >
                Orden de Trabajo
              </router-link>
            </template>
            <template v-else>
              <router-link
                class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/"
              >
                Inicio
              </router-link>
              <router-link
                class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/orders"
              >
                {{ session.user.role === 'ADMIN' ? 'Órdenes' : 'Mis Órdenes' }}
              </router-link>
              <template v-if="session.user.role === 'ADMIN'">
                <span
                  class="mx-1 hidden h-5 border-l border-slate-200 lg:block"
                  aria-hidden="true"
                />
                <span
                  class="hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:inline"
                >
                  Administración
                </span>
                <router-link
                  class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                  active-class="bg-blue-50 text-blue-900 font-semibold"
                  to="/technicians"
                >
                  Técnicos
                </router-link>
                <router-link
                  class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                  active-class="bg-blue-50 text-blue-900 font-semibold"
                  to="/technical-accounts"
                >
                  Cuentas Técnicas
                </router-link>
                <router-link
                  class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                  active-class="bg-blue-50 text-blue-900 font-semibold"
                  to="/admin/clients"
                >
                  Clientes
                </router-link>
                <router-link
                  class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                  active-class="bg-blue-50 text-blue-900 font-semibold"
                  to="/admin/users"
                >
                  Administradores
                </router-link>
                <router-link
                  class="rounded px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-800"
                  active-class="bg-blue-50 text-blue-900 font-semibold"
                  to="/sync"
                >
                  Sincronización
                </router-link>
              </template>
            </template>

            <span class="hidden text-xs text-slate-500 lg:inline">
              {{ session.user.name }}
            </span>

            <n-button quaternary size="small" @click="logout"> Salir </n-button>
          </nav>

          <!-- Mobile hamburger toggle -->
          <button
            v-if="session.user"
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 2xl:hidden focus:outline-none"
            :aria-expanded="isMobileMenuOpen"
            data-tour="navigation"
            aria-label="Menú principal"
            @click="isMobileMenuOpen = !isMobileMenuOpen"
          >
            <svg
              v-if="!isMobileMenuOpen"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg
              v-else
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation Drawer / Dropdown -->
      <div
        v-if="session.user && isMobileMenuOpen"
        class="app-mobile-menu absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 py-3 shadow-lg 2xl:hidden"
      >
        <div class="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <p class="text-xs font-semibold text-slate-800">{{ session.user.name }}</p>
            <p class="text-[11px] text-slate-500">{{ session.user.email }}</p>
          </div>
          <n-tag size="small" :type="session.user.role === 'ADMIN' ? 'primary' : 'info'" round>
            {{
              session.user.role === 'ADMIN'
                ? 'Admin'
                : session.user.orderAccessMode === 'SHARED'
                  ? 'Técnico Compartido'
                  : 'Técnico'
            }}
          </n-tag>
        </div>

        <nav aria-label="Navegación principal" class="flex flex-col space-y-1">
          <template v-if="session.user.orderAccessMode === 'SHARED'">
            <router-link
              class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
              active-class="bg-blue-50 text-blue-900 font-semibold"
              to="/work-order"
              @click="isMobileMenuOpen = false"
            >
              Orden de Trabajo
            </router-link>
          </template>
          <template v-else>
            <p class="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Operación
            </p>
            <router-link
              class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
              active-class="bg-blue-50 text-blue-900 font-semibold"
              to="/"
              @click="isMobileMenuOpen = false"
            >
              Inicio
            </router-link>
            <router-link
              class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
              active-class="bg-blue-50 text-blue-900 font-semibold"
              to="/orders"
              @click="isMobileMenuOpen = false"
            >
              {{ session.user.role === 'ADMIN' ? 'Órdenes' : 'Mis Órdenes' }}
            </router-link>
            <template v-if="session.user.role === 'ADMIN'">
              <p
                class="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400"
              >
                Administración
              </p>
              <router-link
                class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/technicians"
                @click="isMobileMenuOpen = false"
              >
                Técnicos
              </router-link>
              <router-link
                class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/technical-accounts"
                @click="isMobileMenuOpen = false"
              >
                Cuentas Técnicas
              </router-link>
              <router-link
                class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/admin/clients"
                @click="isMobileMenuOpen = false"
              >
                Clientes
              </router-link>
              <router-link
                class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/admin/users"
                @click="isMobileMenuOpen = false"
              >
                Administradores
              </router-link>
              <router-link
                class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-900"
                active-class="bg-blue-50 text-blue-900 font-semibold"
                to="/sync"
                @click="isMobileMenuOpen = false"
              >
                Sincronización
              </router-link>
            </template>
          </template>

          <div class="border-t border-slate-100 pt-2 mt-1">
            <button
              type="button"
              class="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              @click="logout"
            >
              Cerrar sesión
            </button>
          </div>
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
