<script setup lang="ts">
import { useThemeStore } from '@/stores/theme';

const theme = useThemeStore();
</script>

<template>
  <button
    type="button"
    role="switch"
    aria-label="Modo oscuro"
    :aria-checked="theme.isDark"
    :title="theme.isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
    class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    @click="theme.toggle"
  >
    <svg
      aria-hidden="true"
      class="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
    >
      <template v-if="theme.isDark">
        <circle cx="12" cy="12" r="4" />
        <path
          stroke-linecap="round"
          d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
        />
      </template>
      <path
        v-else
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"
      />
    </svg>
  </button>
</template>
