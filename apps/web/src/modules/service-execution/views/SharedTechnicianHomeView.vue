<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NInput,
  NPagination,
  NSelect,
  NSpin,
  NTag,
} from 'naive-ui';
import type { OrderStatus } from '@puk/contracts';
import {
  formatOrderStatus,
  formatServiceType,
  orderStatusTagType,
  useOrdersQuery,
} from '@/modules/orders';
import { reconcileCurrentSessionAccess } from '@/router/identity-reconciliation';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useSessionStore } from '@/stores/session';

const router = useRouter();
const session = useSessionStore();

const search = ref('');
const statusFilter = ref<OrderStatus | ''>('');
const page = ref(1);
const pageSize = 12;

const statusOptions = [
  { label: 'Todas las activas', value: '' },
  { label: 'Asignadas', value: 'ASSIGNED' },
  { label: 'En Progreso', value: 'IN_PROGRESS' },
  { label: 'Requiere Corrección', value: 'REQUIRES_CORRECTION' },
];

const queryParams = computed(() => ({
  search: search.value ? search.value.trim() : undefined,
  status: statusFilter.value ? statusFilter.value : undefined,
  page: page.value,
  pageSize,
}));

const ordersQuery = useOrdersQuery(queryParams);

const orders = computed(() => ordersQuery.data.value?.data ?? []);
const pagination = computed(() => ordersQuery.data.value?.meta.pagination);
const loading = computed(() => ordersQuery.isLoading.value);
const isFetching = computed(() => ordersQuery.isFetching.value);
const error = computed(() =>
  ordersQuery.error.value instanceof Error
    ? ordersQuery.error.value.message
    : ordersQuery.error.value
      ? 'Error al consultar las órdenes de trabajo.'
      : null,
);

async function refresh(): Promise<void> {
  const redirected = await reconcileCurrentSessionAccess(session, router);
  if (!redirected) await ordersQuery.refetch();
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
</script>

<template>
  <app-layout>
    <div class="mx-auto max-w-4xl space-y-6">
      <!-- Minimalist Header -->
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-900">Tablero de Órdenes</h1>
        <n-button secondary size="small" :loading="isFetching" @click="refresh">
          Actualizar
        </n-button>
      </div>

      <!-- Filters -->
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div class="sm:col-span-8">
          <n-input
            v-model:value="search"
            placeholder="Buscar por folio, cliente, técnico..."
            clearable
          />
        </div>
        <div class="sm:col-span-4">
          <n-select
            v-model:value="statusFilter"
            :options="statusOptions"
            placeholder="Filtrar por estado"
          />
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="grid min-h-48 place-items-center">
        <n-spin size="large" />
      </div>

      <!-- Error State -->
      <n-alert v-else-if="error" type="error" title="Error de conexión">
        {{ error }}
      </n-alert>

      <!-- Empty State -->
      <div
        v-else-if="orders.length === 0"
        class="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"
      >
        <n-empty description="No hay órdenes disponibles para trabajar" />
      </div>

      <!-- Orders List Grid -->
      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <n-card
          v-for="order in orders"
          :key="order.id"
          class="rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md"
          hoverable
        >
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span class="font-mono text-base font-bold text-slate-900">{{ order.folio }}</span>
                <p class="text-sm text-slate-500">{{ formatServiceType(order.serviceType) }}</p>
              </div>
              <n-tag size="small" :type="orderStatusTagType(order.status)" round>
                {{ formatOrderStatus(order.status) }}
              </n-tag>
            </div>

            <div class="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <div>
                <p class="font-medium text-slate-800">{{ order.clientNameSnapshot }}</p>
              </div>
              <div>
                <span class="text-xs font-semibold uppercase text-slate-400">Técnico</span>
                <p class="font-medium text-slate-800">
                  {{ order.technician?.name || 'No asignado' }}
                </p>
              </div>
              <div>
                <span class="text-xs font-semibold uppercase text-slate-400">Fecha</span>
                <p class="text-slate-700">{{ formatDate(order.scheduledAt) }}</p>
              </div>
              <div v-if="order._count?.units">
                <p class="text-slate-700">
                  {{ order._count.units }}
                  {{ order._count.units === 1 ? 'unidad' : 'unidades' }}
                </p>
              </div>
            </div>

            <div class="flex items-center justify-end border-t border-slate-100 pt-3">
              <n-button
                type="primary"
                size="medium"
                class="w-full sm:w-auto"
                @click="router.push(`/orders/${order.id}/execute`)"
              >
                {{ order.status === 'IN_PROGRESS' ? 'Continuar Orden →' : 'Atender Orden →' }}
              </n-button>
            </div>
          </div>
        </n-card>
      </div>

      <!-- Pagination -->
      <div v-if="pagination && pagination.totalPages > 1" class="flex justify-center pt-4">
        <n-pagination
          v-model:page="page"
          :page-count="pagination.totalPages"
          :page-size="pageSize"
        />
      </div>
    </div>
  </app-layout>
</template>
