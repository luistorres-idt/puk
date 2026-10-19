<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NEmpty,
  NGrid,
  NGridItem,
  NSpin,
  NStatistic,
  NTag,
  NAlert,
} from 'naive-ui';

import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useSessionStore } from '@/stores/session';
import { formatOrderStatus, formatServiceType, useOrdersQuery } from '@/modules/orders';

const router = useRouter();
const session = useSessionStore();

const ordersQuery = useOrdersQuery({ pageSize: 50 });

const orders = computed(() => ordersQuery.data.value?.data ?? []);
const totalOrders = computed(
  () => ordersQuery.data.value?.meta.pagination?.total ?? orders.value.length,
);

const draftCount = computed(() => orders.value.filter((o) => o.status === 'DRAFT').length);
const assignedCount = computed(() => orders.value.filter((o) => o.status === 'ASSIGNED').length);
const inProgressCount = computed(
  () => orders.value.filter((o) => o.status === 'IN_PROGRESS').length,
);
const correctionCount = computed(
  () => orders.value.filter((o) => o.status === 'REQUIRES_CORRECTION').length,
);
const completedCount = computed(() => orders.value.filter((o) => o.status === 'COMPLETED').length);
const failedCount = computed(
  () =>
    orders.value.filter((o) => o.status === 'FAILED_APPOINTMENT' && !o.failedAppointmentResolution)
      .length,
);

const recentOrders = computed(() => orders.value.slice(0, 5));

function statusTagType(status: string) {
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
</script>

<template>
  <app-layout>
    <div
      data-tour-page="home"
      :data-tour-ready="!ordersQuery.isPending.value"
      :data-tour-error="ordersQuery.isError.value"
      class="space-y-6"
    >
      <!-- Welcome Header -->
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm"
      >
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold text-slate-900">Hola, {{ session.user?.name }}</h1>
            <n-tag size="small" :type="session.user?.role === 'ADMIN' ? 'primary' : 'info'" round>
              {{ session.user?.role === 'ADMIN' ? 'Administrador' : 'Técnico' }}
            </n-tag>
          </div>
          <p class="mt-1 text-sm text-slate-500">
            {{
              session.user?.role === 'ADMIN'
                ? 'Panel de control operativo: supervisa órdenes, asignaciones y sincronización.'
                : 'Bienvenido a tu panel de trabajo: consulta y atiende tus órdenes de servicio asignadas.'
            }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <n-button
            v-if="session.user?.role === 'ADMIN'"
            data-tour="new-order"
            type="primary"
            @click="router.push('/orders/new')"
          >
            + Nueva Orden
          </n-button>
          <n-button data-tour="order-list" secondary @click="router.push('/orders')">
            Ver Todas las Órdenes
          </n-button>
        </div>
      </div>

      <!-- Loading / Error states -->
      <div v-if="ordersQuery.isPending.value" class="grid min-h-48 place-items-center">
        <n-spin size="large" />
      </div>

      <n-alert v-else-if="ordersQuery.isError.value" type="error" class="mb-4">
        No fue posible cargar las métricas operativas del servidor.
      </n-alert>

      <template v-else>
        <!-- Metrics Cards (Admin) -->
        <div v-if="session.user?.role === 'ADMIN'" class="space-y-4">
          <h2 class="text-base font-semibold text-slate-800">Métricas Operativas</h2>
          <n-grid cols="2 s:3 m:6" responsive="screen" :x-gap="12" :y-gap="12">
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-slate-400" size="small">
                <n-statistic label="Total" :value="totalOrders" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-blue-400" size="small">
                <n-statistic label="Borradores" :value="draftCount" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-sky-500" size="small">
                <n-statistic label="Asignadas" :value="assignedCount" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-amber-500" size="small">
                <n-statistic label="En Progreso" :value="inProgressCount" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-orange-500" size="small">
                <n-statistic label="Corrección" :value="correctionCount" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-emerald-500" size="small">
                <n-statistic label="Completadas" :value="completedCount" />
              </n-card>
            </n-grid-item>
          </n-grid>
        </div>

        <!-- Metrics Cards (Technician) -->
        <div v-else class="space-y-4">
          <h2 class="text-base font-semibold text-slate-800">Tus Órdenes Asignadas</h2>
          <n-grid cols="1 s:3" responsive="screen" :x-gap="12" :y-gap="12">
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-sky-500" size="small">
                <n-statistic label="Asignadas para atender" :value="assignedCount" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-amber-500" size="small">
                <n-statistic label="En ejecución" :value="inProgressCount" />
              </n-card>
            </n-grid-item>
            <n-grid-item>
              <n-card class="shadow-sm border-l-4 border-l-emerald-500" size="small">
                <n-statistic label="Finalizadas recientemente" :value="completedCount" />
              </n-card>
            </n-grid-item>
          </n-grid>
        </div>

        <!-- Attention Banner if any requires correction -->
        <n-alert
          v-if="correctionCount > 0 && session.user?.role === 'ADMIN'"
          type="warning"
          title="Atención requerida"
        >
          Hay {{ correctionCount }} orden(es) que requieren corrección administrativa o técnica.
        </n-alert>

        <!-- Attention Banner if any failed appointment -->
        <n-alert
          v-if="failedCount > 0 && session.user?.role === 'ADMIN'"
          type="error"
          title="Citas fallidas registradas"
        >
          Se han registrado {{ failedCount }} citas fallidas que requieren revisión de
          reprogramación o cancelación.
        </n-alert>

        <!-- Recent / Active Orders -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold text-slate-800">
              {{ session.user?.role === 'ADMIN' ? 'Órdenes Recientes' : 'Órdenes Activas' }}
            </h2>
            <router-link
              to="/orders"
              class="text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              Ver todas →
            </router-link>
          </div>

          <n-empty
            v-if="recentOrders.length === 0"
            description="No hay órdenes registradas actualmente."
          />

          <div v-else class="grid grid-cols-1 gap-3">
            <n-card
              v-for="order in recentOrders"
              :key="order.id"
              hoverable
              class="cursor-pointer transition-shadow"
              size="small"
              @click="
                session.user?.role === 'TECHNICIAN'
                  ? router.push(`/orders/${order.id}/execute`)
                  : router.push(`/orders/${order.id}`)
              "
            >
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-mono font-bold text-indigo-700">{{ order.folio }}</span>
                    <n-tag size="small" :type="statusTagType(order.status)">{{
                      formatOrderStatus(order.status)
                    }}</n-tag>
                    <span class="text-xs text-slate-500 font-medium">{{
                      formatServiceType(order.serviceType)
                    }}</span>
                  </div>
                  <p class="text-sm font-semibold text-slate-800 mt-1">
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
                  class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2"
                >
                  <span class="text-xs text-slate-500">
                    {{ new Date(order.scheduledAt).toLocaleDateString() }}
                    {{
                      new Date(order.scheduledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    }}
                  </span>
                  <n-button
                    v-if="session.user?.role === 'TECHNICIAN'"
                    size="small"
                    type="primary"
                    @click.stop="router.push(`/orders/${order.id}/execute`)"
                  >
                    Ver Orden →
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
            </n-card>
          </div>
        </div>
      </template>
    </div>
  </app-layout>
</template>
