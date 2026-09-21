<script setup lang="ts">
import type { SharedTechnicianAccessConfig } from '@puk/contracts';
import { NAlert, NButton, NCard, NSelect, NSpin, NTag } from 'naive-ui';

defineProps<{
  config: SharedTechnicianAccessConfig | null;
  error: string | null;
  loading: boolean;
  options: Array<{ label: string; value: string }>;
  saving: boolean;
  selectedUserId: string | null;
}>();

const emit = defineEmits<{
  'update:selectedUserId': [value: string | null];
  retry: [];
  save: [];
}>();
</script>

<template>
  <n-card class="border border-blue-200 bg-blue-50/20 shadow-sm" size="small">
    <template #header>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-bold text-slate-800"
            >Cuenta Compartida de Taller (Kiosco / Tablet)</span
          >
          <n-tag v-if="config" size="small" type="info" round>
            Revisión: #{{ config.revision }}
          </n-tag>
        </div>
        <n-tag
          size="small"
          :type="config?.userId ? 'success' : 'default'"
          round
          class="self-start sm:self-auto"
        >
          {{ config?.userId ? 'Tablero Multi-Orden Activo' : 'Sin Cuenta Asignada' }}
        </n-tag>
      </div>
    </template>
    <p class="mb-3 text-xs text-slate-600">
      La cuenta seleccionada aquí tendrá acceso al Tablero de Taller para que los operarios ejecuten
      cualquiera de las órdenes asignadas en paralelo sin requerir autorizaciones 1 a 1.
    </p>
    <n-alert v-if="error" type="error" class="mb-3" role="alert">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{{ error }}</span>
        <n-button size="small" secondary @click="emit('retry')">Reintentar</n-button>
      </div>
    </n-alert>
    <div v-if="loading" class="grid min-h-16 place-items-center" aria-live="polite">
      <n-spin size="small" />
    </div>
    <div v-else class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <n-select
        :value="selectedUserId"
        size="small"
        :options="options"
        class="flex-1"
        placeholder="Seleccionar cuenta de técnico para taller"
        @update:value="emit('update:selectedUserId', $event)"
      />
      <n-button
        type="primary"
        size="small"
        :loading="saving"
        :disabled="!config || selectedUserId === config.userId"
        @click="emit('save')"
      >
        Guardar Cuenta Designada
      </n-button>
    </div>
  </n-card>
</template>
