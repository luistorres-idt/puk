<script setup lang="ts">
import { NButton, NCard, NEmpty, NSpin, NTag } from 'naive-ui';
import type { fetchSyncStatus } from '../api.js';

defineProps<{
  syncInfo: Awaited<ReturnType<typeof fetchSyncStatus>> | undefined;
  isPending: boolean;
  isAdmin: boolean;
  retryPending: boolean;
}>();

const emit = defineEmits<{
  (event: 'retry'): void;
}>();
</script>

<template>
  <div class="space-y-4">
    <n-card
      v-if="syncInfo && syncInfo.total > 0"
      class="border-l-4 border-l-indigo-500 shadow-sm"
      size="small"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold text-slate-800 text-sm">Estado de sincronización</h3>
          <p class="text-xs text-slate-500 mt-0.5">
            {{ syncInfo.isFullySynced ? 'Completamente sincronizada' : 'Pendiente / en proceso' }}
            &bull; Operaciones: {{ syncInfo.synced }} / {{ syncInfo.total }}
            <span v-if="syncInfo.failed > 0" class="text-red-600 font-bold ml-1">
              ({{ syncInfo.failed }} fallidas)
            </span>
          </p>
        </div>

        <n-button
          v-if="syncInfo.failed > 0 && isAdmin"
          size="small"
          type="warning"
          :loading="retryPending"
          @click="emit('retry')"
        >
          Reintentar Operaciones
        </n-button>
      </div>
    </n-card>

    <div class="flex items-center justify-between">
      <h3 class="text-base font-bold text-slate-800">Operaciones de Sincronización</h3>
      <n-button
        v-if="isAdmin && (syncInfo?.failed ?? 0) > 0"
        size="small"
        type="primary"
        secondary
        :loading="retryPending"
        @click="emit('retry')"
      >
        Reintentar fallidas
      </n-button>
    </div>

    <div v-if="isPending" class="grid min-h-32 place-items-center">
      <n-spin size="medium" />
    </div>

    <div v-else-if="syncInfo && syncInfo.operations.length > 0" class="space-y-2">
      <div
        v-for="(op, idx) in syncInfo.operations"
        :key="idx"
        class="p-3 bg-white border border-slate-200 rounded-lg shadow-sm text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
      >
        <div>
          <div class="flex items-center gap-2">
            <n-tag
              size="tiny"
              :type="
                op.status === 'SYNCED' ? 'success' : op.status === 'FAILED' ? 'error' : 'warning'
              "
            >
              {{ op.status }}
            </n-tag>
            <span class="font-semibold text-slate-700"
              >Fila Sheets: {{ op.payload?.row ?? 'N/A' }}</span
            >
            <span class="text-slate-400 text-[11px]">Intentos: {{ op.attempts }}</span>
          </div>
          <p
            v-if="op.operationType === 'SHEET_TECHNICAL_REPORT' && op.scheduledFor"
            class="mt-1 text-slate-500"
          >
            Programada: {{ new Date(op.scheduledFor).toLocaleString() }}
          </p>
          <p v-if="op.lastErrorMessage" class="text-red-500 font-mono text-[11px] mt-1">
            Error: {{ op.lastErrorMessage }}
          </p>
        </div>

        <span class="text-slate-400 text-[11px] font-mono">
          {{ op.createdAt ? new Date(op.createdAt).toLocaleString() : '' }}
        </span>
      </div>
    </div>

    <n-empty v-else description="No existen operaciones de sincronización para esta orden." />
  </div>
</template>
