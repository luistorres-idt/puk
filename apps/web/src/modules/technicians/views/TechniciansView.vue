<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { NAlert, NCard, NEmpty, NSpin, NTag } from 'naive-ui';

import AppLayout from '@/shared/layouts/AppLayout.vue';
import { api } from '@/shared/http/client';

interface Technician {
  active: boolean;
  city: string | null;
  id: string;
  name: string;
  phone: string | null;
  workshop: string | null;
}

const technicians = useQuery({
  queryFn: async () => (await api.get<{ data: Technician[] }>('/technicians')).data.data,
  queryKey: ['technicians'],
});
</script>

<template>
  <app-layout>
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-slate-900">Técnicos</h1>
        <p class="mt-1 text-sm text-slate-600">Directorio del personal técnico.</p>
      </div>
      <div v-if="technicians.isPending.value" class="grid min-h-48 place-items-center">
        <n-spin />
      </div>
      <n-alert v-else-if="technicians.isError.value" type="error">
        No fue posible cargar el directorio.
      </n-alert>
      <n-empty
        v-else-if="technicians.data.value?.length === 0"
        description="No hay técnicos registrados"
      />
      <div v-else class="grid gap-4 sm:grid-cols-2">
        <n-card v-for="technician in technicians.data.value" :key="technician.id" size="small">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold text-slate-900">{{ technician.name }}</h2>
              <p class="text-sm text-slate-500">{{ technician.workshop || 'Sin taller' }}</p>
              <p class="mt-2 text-sm text-slate-600">
                {{ technician.city || 'Ciudad no registrada' }}
              </p>
              <p v-if="technician.phone" class="text-sm text-slate-600">{{ technician.phone }}</p>
            </div>
            <n-tag :type="technician.active ? 'success' : 'default'">{{
              technician.active ? 'Activo' : 'Inactivo'
            }}</n-tag>
          </div>
        </n-card>
      </div>
    </main>
  </app-layout>
</template>
