<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NInput,
  NSelect,
  NSpin,
  NTag,
  NTimePicker,
  useMessage,
} from 'naive-ui';
import type { SyncStatus, UpdateTechnicalReportSyncSchedule } from '@puk/contracts';

import AppLayout from '@/shared/layouts/AppLayout.vue';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import {
  fetchSyncOperations,
  fetchSyncSchedule,
  retrySyncOperation,
  updateSyncSchedule,
} from '../api.js';

const message = useMessage();
const queryClient = useQueryClient();
const filters = reactive({
  operationType: 'SHEET_TECHNICAL_REPORT' as string | null,
  page: 1,
  search: '',
  status: null as string | null,
});
const scheduleForm = reactive<UpdateTechnicalReportSyncSchedule>({
  cutoffWeekday: 2,
  syncTime: '17:00',
  syncWeekday: 3,
  timeZone: 'America/Hermosillo',
});
const weekdays = [
  { label: 'Domingo', value: 0 },
  { label: 'Lunes', value: 1 },
  { label: 'Martes', value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 },
  { label: 'Viernes', value: 5 },
  { label: 'Sábado', value: 6 },
];
const supportedTimeZones =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
const timeZoneOptions = computed(() =>
  Array.from(
    new Set(['UTC', 'America/Hermosillo', scheduleForm.timeZone, ...supportedTimeZones]),
  ).map((value) => ({ label: value.replaceAll('_', ' '), value })),
);
const statusOptions = [
  { label: 'Todos', value: '' },
  { label: 'Programadas / pendientes', value: 'PENDING' },
  { label: 'Procesando', value: 'PROCESSING' },
  { label: 'Sincronizadas', value: 'SYNCED' },
  { label: 'Fallidas', value: 'FAILED' },
  { label: 'Sustituidas', value: 'SUPERSEDED' },
];
const typeOptions = [
  { label: 'Todos los tipos', value: '' },
  { label: 'Reporte técnico', value: 'SHEET_TECHNICAL_REPORT' },
  { label: 'Equipos', value: 'SHEET_EQUIPMENT_ASSIGNMENT' },
];

const operationsQuery = useQuery({
  queryKey: ['sync-operations', filters],
  queryFn: () =>
    fetchSyncOperations({
      ...(filters.operationType ? { operationType: filters.operationType } : {}),
      page: filters.page,
      pageSize: 25,
      ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    }),
  refetchInterval: 10_000,
});
const scheduleQuery = useQuery({ queryKey: ['sync-schedule'], queryFn: fetchSyncSchedule });

watch(
  () => scheduleQuery.data.value,
  (schedule) => {
    if (!schedule) return;
    Object.assign(scheduleForm, {
      cutoffWeekday: schedule.cutoffWeekday,
      syncTime: schedule.syncTime,
      syncWeekday: schedule.syncWeekday,
      timeZone: schedule.timeZone,
    });
  },
  { immediate: true },
);
watch(
  () => [filters.search, filters.status, filters.operationType],
  () => {
    filters.page = 1;
  },
);

const saveSchedule = useMutation({
  mutationFn: () => updateSyncSchedule({ ...scheduleForm }),
  onSuccess: async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sync-schedule'] }),
      queryClient.invalidateQueries({ queryKey: ['sync-operations'] }),
    ]);
    message.success('Horario de sincronización actualizado.');
  },
  onError: (error) => message.error(extractApiErrorMessage(error, 'No se pudo guardar el horario')),
});
const retryOperation = useMutation({
  mutationFn: retrySyncOperation,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['sync-operations'] });
    message.success('La operación se envió a sincronización inmediata.');
  },
  onError: (error) => message.error(extractApiErrorMessage(error, 'No se pudo reintentar')),
});

const result = computed(() => operationsQuery.data.value);
const schedule = computed(() => scheduleQuery.data.value);
const cutoffLabel = computed(
  () =>
    weekdays
      .find((day) => day.value === schedule.value?.cutoffWeekday)
      ?.label.toLocaleLowerCase('es-MX') ?? '',
);
const summaryCards = computed(() => [
  {
    label:
      filters.operationType === 'SHEET_TECHNICAL_REPORT' ? 'Reportes programados' : 'Programadas',
    value: result.value?.summary.PENDING ?? 0,
    color: 'text-amber-700',
  },
  {
    label:
      filters.operationType === 'SHEET_TECHNICAL_REPORT' ? 'Reportes procesando' : 'Procesando',
    value: result.value?.summary.PROCESSING ?? 0,
    color: 'text-blue-700',
  },
  {
    label:
      filters.operationType === 'SHEET_TECHNICAL_REPORT'
        ? 'Reportes sincronizados'
        : 'Sincronizadas',
    value: result.value?.summary.SYNCED ?? 0,
    color: 'text-emerald-700',
  },
  {
    label: filters.operationType === 'SHEET_TECHNICAL_REPORT' ? 'Reportes fallidos' : 'Fallidas',
    value: result.value?.summary.FAILED ?? 0,
    color: 'text-red-700',
  },
]);

function statusLabel(status: SyncStatus, nextAttemptAt: string | null): string {
  if (status === 'PENDING')
    return nextAttemptAt && new Date(nextAttemptAt) > new Date() ? 'PROGRAMADA' : 'PENDIENTE';
  if (status === 'SUPERSEDED') return 'SUSTITUIDA';
  if (status === 'SYNCED') return 'SINCRONIZADA';
  if (status === 'FAILED') return 'FALLIDA';
  return 'PROCESANDO';
}
function statusType(status: SyncStatus): 'success' | 'error' | 'warning' | 'info' | 'default' {
  if (status === 'SYNCED') return 'success';
  if (status === 'FAILED') return 'error';
  if (status === 'PROCESSING') return 'info';
  if (status === 'SUPERSEDED') return 'default';
  return 'warning';
}
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-MX', {
    timeZone: schedule.value?.timeZone ?? 'America/Hermosillo',
  });
}
</script>

<template>
  <app-layout>
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Sincronización</h1>
        <p class="mt-1 text-sm text-slate-600">
          Programación y seguimiento del reporte técnico. Las operaciones de equipos están
          disponibles desde el filtro de tipo.
        </p>
      </div>

      <n-card title="Horario del reporte técnico" class="shadow-sm">
        <div v-if="scheduleQuery.isPending.value" class="grid min-h-24 place-items-center">
          <n-spin />
        </div>
        <div v-else class="grid gap-4 md:grid-cols-5">
          <div>
            <label class="mb-1 block text-xs text-slate-500">Día de corte</label
            ><n-select v-model:value="scheduleForm.cutoffWeekday" :options="weekdays" />
          </div>
          <div>
            <label class="mb-1 block text-xs text-slate-500">Día de envío</label
            ><n-select v-model:value="scheduleForm.syncWeekday" :options="weekdays" />
          </div>
          <div>
            <label class="mb-1 block text-xs text-slate-500">Hora de envío</label
            ><n-time-picker
              :formatted-value="scheduleForm.syncTime"
              format="HH:mm"
              value-format="HH:mm"
              input-readonly
              @update:formatted-value="(value) => value && (scheduleForm.syncTime = value)"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs text-slate-500">Zona horaria</label
            ><n-select
              v-model:value="scheduleForm.timeZone"
              :options="timeZoneOptions"
              filterable
            />
          </div>
          <div class="flex items-end">
            <n-button
              type="primary"
              class="w-full md:w-auto"
              :loading="saveSchedule.isPending.value"
              @click="saveSchedule.mutate()"
            >
              Guardar horario
            </n-button>
          </div>
        </div>
        <n-alert v-if="schedule" class="mt-4" type="info" :show-icon="false">
          Próxima sincronización: <strong>{{ formatDate(schedule.nextSyncAt) }}</strong
          >. Las órdenes se aceptan hasta el final del {{ cutoffLabel }}.
        </n-alert>
      </n-card>

      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <n-card v-for="card in summaryCards" :key="card.label" size="small"
          ><p class="text-xs text-slate-500">{{ card.label }}</p>
          <p class="text-2xl font-bold" :class="card.color">{{ card.value }}</p></n-card
        >
      </div>

      <n-card class="shadow-sm">
        <div class="mb-4 grid gap-3 md:grid-cols-3">
          <n-input
            v-model:value="filters.search"
            clearable
            placeholder="Buscar folio, cliente o técnico"
          />
          <n-select
            v-model:value="filters.status"
            :options="statusOptions"
            clearable
            placeholder="Estado"
          />
          <n-select
            v-model:value="filters.operationType"
            :options="typeOptions"
            clearable
            placeholder="Tipo"
          />
        </div>
        <div v-if="operationsQuery.isPending.value" class="grid min-h-48 place-items-center">
          <n-spin />
        </div>
        <n-alert v-else-if="operationsQuery.isError.value" type="error"
          >No fue posible cargar las operaciones.</n-alert
        >
        <n-empty
          v-else-if="!result?.operations.length"
          description="No hay operaciones con estos filtros"
        />
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[900px] text-left text-sm">
            <thead class="border-b text-xs text-slate-500">
              <tr>
                <th class="p-3">Orden</th>
                <th class="p-3">Tipo</th>
                <th class="p-3">Estado</th>
                <th class="p-3">Programada</th>
                <th class="p-3">Sincronizada</th>
                <th class="p-3">Intentos / error</th>
                <th class="p-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="operation in result.operations"
                :key="operation.id"
                class="border-b border-slate-100 align-top"
              >
                <td class="p-3">
                  <router-link
                    v-if="operation.orderId"
                    class="font-semibold text-blue-700"
                    :to="`/orders/${operation.orderId}`"
                    >{{ operation.order?.folio ?? 'Orden' }}</router-link
                  >
                  <p class="text-xs text-slate-500">{{ operation.order?.clientNameSnapshot }}</p>
                  <p class="text-xs text-slate-400">
                    {{ operation.order?.technicianNameSnapshot }}
                  </p>
                </td>
                <td class="p-3">
                  {{
                    operation.operationType === 'SHEET_TECHNICAL_REPORT'
                      ? 'Reporte técnico'
                      : 'Equipo'
                  }}
                </td>
                <td class="p-3">
                  <n-tag size="small" :type="statusType(operation.status)">{{
                    statusLabel(operation.status, operation.nextAttemptAt)
                  }}</n-tag>
                </td>
                <td class="p-3 text-xs">
                  {{ formatDate(operation.scheduledFor ?? operation.nextAttemptAt) }}
                </td>
                <td class="p-3 text-xs">{{ formatDate(operation.syncedAt) }}</td>
                <td class="max-w-xs p-3 text-xs">
                  <span>{{ operation.attempts }}</span>
                  <p v-if="operation.lastErrorMessage" class="mt-1 text-red-600">
                    {{ operation.lastErrorMessage }}
                  </p>
                </td>
                <td class="p-3">
                  <n-button
                    v-if="operation.status === 'FAILED' || operation.status === 'PENDING'"
                    size="tiny"
                    secondary
                    :loading="retryOperation.isPending.value"
                    @click="retryOperation.mutate(operation.id)"
                    >Sincronizar ahora</n-button
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <div class="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>{{ result.pagination.total }} operaciones</span>
            <div class="flex gap-2">
              <n-button size="small" :disabled="filters.page <= 1" @click="filters.page--"
                >Anterior</n-button
              ><span class="px-2 py-1"
                >{{ filters.page }} / {{ Math.max(1, result.pagination.totalPages) }}</span
              ><n-button
                size="small"
                :disabled="filters.page >= result.pagination.totalPages"
                @click="filters.page++"
                >Siguiente</n-button
              >
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </app-layout>
</template>
