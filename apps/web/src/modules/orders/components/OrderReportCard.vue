<script setup lang="ts">
import { NButton, NCard, NTag } from 'naive-ui';
import ReportEmailPanel from './ReportEmailPanel.vue';
import type { ServiceOrderReport } from '../api.js';

defineProps<{
  orderId: string;
  report: ServiceOrderReport | null | undefined;
  reportVersions: ServiceOrderReport[];
  isAdmin: boolean;
  requestPending: boolean;
}>();

const emit = defineEmits<{
  (event: 'generate'): void;
  (event: 'download', version?: number): void;
  (event: 'refresh'): void;
}>();

function reportStatusLabel(status?: string): string {
  return (
    {
      PENDING: 'Pendiente',
      PROCESSING: 'Generando',
      READY: 'Disponible',
      FAILED: 'Falló',
    }[status ?? ''] ?? 'No generado'
  );
}
</script>

<template>
  <!-- Service order PDF report -->
  <n-card class="border-l-4 border-l-blue-600 shadow-sm" size="small">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-slate-800 text-sm">Reporte de orden de servicio</h3>
          <n-tag
            size="small"
            :type="
              report?.status === 'READY'
                ? 'success'
                : report?.status === 'FAILED'
                  ? 'error'
                  : 'info'
            "
          >
            {{ reportStatusLabel(report?.status) }}
          </n-tag>
        </div>
        <p v-if="report?.status === 'READY'" class="text-xs text-slate-500 mt-1">
          Versión {{ report.version }}
          <span v-if="report.generatedAt">
            &bull; Generado {{ new Date(report.generatedAt).toLocaleString() }}
          </span>
        </p>
        <p v-else-if="report?.status === 'FAILED'" class="text-xs text-red-600 mt-1">
          {{ report.failureReason || 'La generación no pudo completarse.' }}
        </p>
        <p v-else class="text-xs text-slate-500 mt-1">
          El PDF incluye portada, unidades, equipos, checklist, firma y fotografías.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <report-email-panel
          v-if="isAdmin && report?.status === 'READY'"
          :order-id="orderId"
          :report-id="report.id"
          :version="report.version"
        />
        <n-button
          v-if="report?.status === 'READY'"
          type="primary"
          size="small"
          @click="emit('download')"
        >
          Descargar PDF
        </n-button>
        <n-button
          v-if="(!report || report.status === 'FAILED') && isAdmin"
          type="warning"
          size="small"
          :loading="requestPending"
          @click="emit('generate')"
        >
          {{ report?.status === 'FAILED' ? 'Reintentar' : 'Generar reporte' }}
        </n-button>
        <n-button
          v-if="report?.status === 'PENDING' || report?.status === 'PROCESSING'"
          size="small"
          secondary
          @click="emit('refresh')"
        >
          Actualizar
        </n-button>
      </div>
    </div>
    <div v-if="reportVersions.length > 1" class="mt-3 border-t border-slate-100 pt-3">
      <p class="text-xs font-semibold text-slate-600 mb-2">Versiones anteriores</p>
      <div class="flex flex-wrap gap-2">
        <n-button
          v-for="previous in reportVersions.filter(
            (item) => item.status === 'READY' && item.version !== report?.version,
          )"
          :key="previous.id"
          size="tiny"
          secondary
          @click="emit('download', previous.version)"
        >
          Descargar versión {{ previous.version }}
        </n-button>
      </div>
    </div>
  </n-card>
</template>
