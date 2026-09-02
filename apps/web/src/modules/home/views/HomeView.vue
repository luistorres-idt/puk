<script setup lang="ts">
import { NCard, NTag } from 'naive-ui';

import AppLayout from '@/shared/layouts/AppLayout.vue';
</script>

<template>
  <app-layout>
    <main class="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-10 sm:px-6">
      <n-card class="shadow-sm" content-class="space-y-5" size="large">
        <div class="flex flex-wrap items-center gap-3">
          <n-tag type="success" round>Base del sistema lista</n-tag>
          <span class="text-sm font-medium text-slate-500">Fase 1</span>
        </div>
        <div class="space-y-3">
          <h1 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Órdenes de servicio
          </h1>
          <p class="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            La plataforma está preparada para incorporar los flujos de administración y trabajo
            técnico de Bull Dog Solution.
          </p>
        </div>
      </n-card>
    </main>
  </app-layout>
</template>
