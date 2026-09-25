<script setup lang="ts">
import { NButton, NEmpty, NSpin } from 'naive-ui';
import type { AuditLogItem } from '../api.js';

defineProps<{
  auditLogs: AuditLogItem[];
  isPending: boolean;
}>();

const emit = defineEmits<{
  (event: 'refresh'): void;
}>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-bold text-slate-800">Historial de Eventos de la Orden</h3>
      <n-button size="small" secondary @click="emit('refresh')"> Actualizar Registro </n-button>
    </div>

    <div v-if="isPending" class="grid min-h-32 place-items-center">
      <n-spin size="medium" />
    </div>

    <n-empty
      v-else-if="auditLogs.length === 0"
      description="No hay eventos de auditoría registrados."
    />

    <div v-else class="space-y-2">
      <div
        v-for="log in auditLogs"
        :key="log.id"
        class="p-3 bg-white border border-slate-200 rounded-lg shadow-sm text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
      >
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-800">{{ log.action }}</span>
            <span class="text-slate-400">&bull;</span>
            <span class="text-slate-600 font-medium">{{
              log.actor?.name || log.actor?.email || 'Sistema'
            }}</span>
          </div>
          <p v-if="log.payload" class="text-slate-500 font-mono text-[11px] mt-1 line-clamp-2">
            {{ JSON.stringify(log.payload) }}
          </p>
        </div>

        <span class="text-slate-400 font-mono text-[11px] whitespace-nowrap">
          {{ new Date(log.createdAt).toLocaleString() }}
        </span>
      </div>
    </div>
  </div>
</template>
