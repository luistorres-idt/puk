<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
import { formatOrderStatus, formatServiceType, orderStatusTagType } from '../formatters.js';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useSessionStore } from '@/stores/session';
import { useOrdersQuery } from '../queries';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

// Initialize filters from URL query
const search = ref<string>(typeof route.query.search === 'string' ? route.query.search : '');
const statusFilter = ref<string>(typeof route.query.status === 'string' ? route.query.status : '');
const page = ref<number>(
  typeof route.query.page === 'string' && !isNaN(Number(route.query.page))
    ? Math.max(1, Number(route.query.page))
    : 1,
);
const pageSize = 15;

const queryParams = computed(() => ({
  search: search.value ? search.value.trim() : undefined,
  status: statusFilter.value ? (statusFilter.value as OrderStatus) : undefined,
  page: page.value,
  pageSize,
}));

const ordersQuery = useOrdersQuery(queryParams);

const orders = computed(() => ordersQuery.data.value?.data ?? []);
const pagination = computed(() => ordersQuery.data.value?.meta.pagination);

// Sync query changes to URL query
function updateUrlQuery() {
  const query: Record<string, string> = {};
  if (search.value.trim()) query.search = search.value.trim();
  if (statusFilter.value) query.status = statusFilter.value;
  if (page.value > 1) query.page = String(page.value);

  router.replace({ query });
}

// Watch for manual changes in route query (e.g. back/forward navigation)
watch(
  () => route.query,
  (newQuery) => {
    const querySearch = typeof newQuery.search === 'string' ? newQuery.search : '';
    const queryStatus = typeof newQuery.status === 'string' ? newQuery.status : '';
    const queryPage =
      typeof newQuery.page === 'string' && !isNaN(Number(newQuery.page))
        ? Math.max(1, Number(newQuery.page))
        : 1;

    if (querySearch !== search.value) search.value = querySearch;
    if (queryStatus !== statusFilter.value) statusFilter.value = queryStatus;
    if (queryPage !== page.value) page.value = queryPage;
  },
);

function onFilterChange() {
  page.value = 1;
  updateUrlQuery();
}

function onPageChange(newPage: number) {
  page.value = newPage;
  updateUrlQuery();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFilters() {
  search.value = '';
  statusFilter.value = '';
  page.value = 1;
  updateUrlQuery();
}

const statusOptions = [
  { label: 'Todos los estados', value: '' },
  { label: 'Borrador', value: 'DRAFT' },
  { label: 'Asignada', value: 'ASSIGNED' },
  { label: 'En Progreso', value: 'IN_PROGRESS' },
  { label: 'Requiere Corrección', value: 'REQUIRES_CORRECTION' },
  { label: 'Completada', value: 'COMPLETED' },
  { label: 'Cita Fallida', value: 'FAILED_APPOINTMENT' },
  { label: 'Cancelada', value: 'CANCELLED' },
];

const statusColor = orderStatusTagType;
</script>

<template>
  <app-layout>
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800">
            {{ session.user?.role === 'ADMIN' ? 'Órdenes de Servicio' : 'Mis Órdenes de Servicio' }}
          </h1>
          <p class="text-sm text-slate-500">
            {{
              session.user?.role === 'ADMIN'
                ? 'Gestión administrativa, seguimiento y sincronización vehicular'
                : 'Lista de servicios vehiculares asignados para ejecución'
            }}
          </p>
        </div>

        <n-button
          v-if="session.user?.role === 'ADMIN'"
          type="primary"
          @click="router.push('/orders/new')"
        >
          + Nueva Orden
        </n-button>
      </div>

      <!-- Filters Card -->
      <n-card class="shadow-sm">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Buscar</label>
            <n-input
              v-model:value="search"
              placeholder="Folio o cliente..."
              clearable
              @update:value="onFilterChange"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Filtrar por Estado</label>
            <n-select
              v-model:value="statusFilter"
              :options="statusOptions"
              @update:value="onFilterChange"
            />
          </div>
          <div class="flex items-end">
            <n-button secondary class="w-full sm:w-auto" @click="resetFilters">
              Limpiar filtros
            </n-button>
          </div>
        </div>
      </n-card>

      <!-- Loading / Error states -->
      <div v-if="ordersQuery.isPending.value" class="grid min-h-48 place-items-center">
        <n-spin size="large" />
      </div>

      <n-alert v-else-if="ordersQuery.isError.value" type="error">
        Ocurrió un error al cargar el listado de órdenes. Verifica tu conexión e intenta de nuevo.
      </n-alert>

      <!-- Empty State -->
      <div
        v-else-if="orders.length === 0"
        class="bg-white rounded-xl border border-slate-200 py-12 px-4 text-center"
      >
        <n-empty description="No se encontraron órdenes con los filtros seleccionados.">
          <template #extra>
            <n-button v-if="search || statusFilter" size="small" secondary @click="resetFilters">
              Restablecer filtros
            </n-button>
          </template>
        </n-empty>
      </div>

      <!-- Orders Cards Grid -->
      <div v-else class="grid grid-cols-1 gap-4">
        <n-card
          v-for="order in orders"
          :key="order.id"
          hoverable
          class="cursor-pointer transition-shadow"
          @click="
            session.user?.role === 'TECHNICIAN' &&
            (order.status === 'ASSIGNED' ||
              order.status === 'IN_PROGRESS' ||
              order.status === 'REQUIRES_CORRECTION')
              ? router.push(`/orders/${order.id}/execute`)
              : router.push(`/orders/${order.id}`)
          "
        >
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono font-bold text-indigo-700 text-base">{{ order.folio }}</span>
                <n-tag size="small" :type="statusColor(order.status)">
                  {{ formatOrderStatus(order.status) }}
                </n-tag>
                <span class="text-xs text-slate-500 font-medium">{{ formatServiceType(order.serviceType) }}</span>
              </div>
              <p class="text-base font-semibold text-slate-800 mt-1">
                {{ order.clientNameSnapshot }}
              </p>
              <p class="text-xs text-slate-500">
                Técnico:
                <span class="font-medium text-slate-700">{{
                  order.technician?.name || 'Sin asignar'
                }}</span>
                &bull; Unidades:
                <span class="font-medium text-slate-700">{{ order._count?.units ?? 0 }}</span>
              </p>
            </div>

            <div
              class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto gap-2"
            >
              <div class="text-left sm:text-right">
                <span class="text-xs text-slate-400 block">Programado para</span>
                <span class="text-sm font-medium text-slate-700">
                  {{ new Date(order.scheduledAt).toLocaleDateString() }}
                  {{
                    new Date(order.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }}
                </span>
              </div>
              <div>
                <n-button
                  v-if="
                    session.user?.role === 'TECHNICIAN' &&
                    (order.status === 'ASSIGNED' ||
                      order.status === 'IN_PROGRESS' ||
                      order.status === 'REQUIRES_CORRECTION')
                  "
                  size="small"
                  type="primary"
                  @click.stop="router.push(`/orders/${order.id}/execute`)"
                >
                  Atender Orden →
                </n-button>
                <n-button
                  v-else
                  size="small"
                  secondary
                  @click.stop="router.push(`/orders/${order.id}`)"
                >
                  Detalle →
                </n-button>
              </div>
            </div>
          </div>
        </n-card>

        <!-- Pagination -->
        <div v-if="pagination && pagination.totalPages > 1" class="flex justify-center pt-4">
          <n-pagination
            :page="page"
            :page-count="pagination.totalPages"
            :page-size="pageSize"
            @update:page="onPageChange"
          />
        </div>
      </div>
    </div>
  </app-layout>
</template>
