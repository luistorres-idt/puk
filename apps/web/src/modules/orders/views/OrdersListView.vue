<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NInput,
  NSelect,
  NTag,
  NSpin,
} from 'naive-ui';
import type { OrderStatus } from '@puk/contracts';
import { useSessionStore } from '../../../stores/session.js';
import { fetchOrders, type OrderSummary } from '../api.js';

const router = useRouter();
const session = useSessionStore();

const orders = ref<OrderSummary[]>([]);
const loading = ref(false);
const search = ref('');
const statusFilter = ref<string>('');
const page = ref(1);
const totalPages = ref(1);

const statusOptions = [
  { label: 'Todos', value: '' },
  { label: 'Borrador (DRAFT)', value: 'DRAFT' },
  { label: 'Asignada (ASSIGNED)', value: 'ASSIGNED' },
  { label: 'En Progreso (IN_PROGRESS)', value: 'IN_PROGRESS' },
  { label: 'Requiere Corrección (REQUIRES_CORRECTION)', value: 'REQUIRES_CORRECTION' },
  { label: 'Completada (COMPLETED)', value: 'COMPLETED' },
  { label: 'Cita Fallida (FAILED_APPOINTMENT)', value: 'FAILED_APPOINTMENT' },
  { label: 'Cancelada (CANCELLED)', value: 'CANCELLED' },
];

function statusColor(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'default';
    case 'ASSIGNED':
      return 'info';
    case 'IN_PROGRESS':
      return 'warning';
    case 'REQUIRES_CORRECTION':
      return 'warning';
    case 'COMPLETED':
      return 'success';
    case 'FAILED_APPOINTMENT':
    case 'CANCELLED':
      return 'error';
    default:
      return 'default';
  }
}

async function loadOrders() {
  loading.value = true;
  try {
    const res = await fetchOrders({
      search: search.value || undefined,
      status: statusFilter.value ? (statusFilter.value as OrderStatus) : undefined,
      page: page.value,
      pageSize: 15,
    });
    orders.value = res.data;
    if (res.meta.pagination) {
      totalPages.value = res.meta.pagination.totalPages;
    }
  } catch {
    // Graceful error handling
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadOrders();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">Órdenes de Servicio</h1>
        <p class="text-sm text-slate-500">Gestión y seguimiento de órdenes vehiculares</p>
      </div>

      <NButton
        v-if="session.user?.role === 'ADMIN'"
        type="primary"
        @click="router.push('/orders/new')"
      >
        + Nueva Orden
      </NButton>
    </div>

    <!-- Filters -->
    <NCard class="shadow-sm">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Buscar</label>
          <NInput
            v-model:value="search"
            placeholder="Folio o cliente..."
            clearable
            @update:value="() => { page = 1; loadOrders(); }"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Estado</label>
          <NSelect
            v-model:value="statusFilter"
            :options="statusOptions"
            @update:value="() => { page = 1; loadOrders(); }"
          />
        </div>
        <div class="flex items-end">
          <NButton secondary @click="() => { search = ''; statusFilter = ''; page = 1; loadOrders(); }">
            Limpiar filtros
          </NButton>
        </div>
      </div>
    </NCard>

    <!-- Orders List -->
    <NSpin :show="loading">
      <div v-if="orders.length === 0 && !loading" class="text-center py-12 bg-white rounded-lg border border-slate-200">
        <p class="text-slate-500">No se encontraron órdenes de servicio.</p>
      </div>

      <div v-else class="grid grid-cols-1 gap-4">
        <NCard
          v-for="order in orders"
          :key="order.id"
          hoverable
          class="cursor-pointer transition-shadow"
          @click="router.push(`/orders/${order.id}`)"
        >
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono font-bold text-indigo-700">{{ order.folio }}</span>
                <NTag size="small" :type="statusColor(order.status)">{{ order.status }}</NTag>
              </div>
              <p class="text-base font-semibold text-slate-800 mt-1">{{ order.clientNameSnapshot }}</p>
              <p class="text-xs text-slate-500">
                Tipo: <span class="font-medium">{{ order.serviceType }}</span> •
                Técnico: <span class="font-medium">{{ order.technician?.name || 'Sin asignar' }}</span> •
                Unidades: <span class="font-medium">{{ order._count?.units ?? 0 }}</span>
              </p>
            </div>

            <div class="text-right sm:text-right">
              <span class="text-xs text-slate-400 block">Programado para</span>
              <span class="text-sm font-medium text-slate-700">
                {{ new Date(order.scheduledAt).toLocaleDateString() }} {{ new Date(order.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
              <NButton size="small" secondary class="mt-2" @click.stop="router.push(`/orders/${order.id}`)">
                Detalle →
              </NButton>
            </div>
          </div>
        </NCard>
      </div>
    </NSpin>
  </div>
</template>
