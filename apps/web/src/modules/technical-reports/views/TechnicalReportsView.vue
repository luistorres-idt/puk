<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { refDebounced } from '@vueuse/core';
import type { TechnicalReportOrder } from '@puk/contracts';
import {
  NAlert,
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NInput,
  NInputNumber,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { dispatchTechnicianReports } from '@/modules/sync';
import { useSessionStore } from '@/stores/session';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import { useTechnicalReports } from '../useTechnicalReports.js';

const session = useSessionStore();
const message = useMessage();
const {
  report,
  allOrders,
  weekOffset,
  search,
  loading,
  savingDhl,
  exporting,
  error,
  actionError,
  load,
  changeWeek,
  resetToCurrentWeek,
  saveDhlShipping,
  exportExcel,
} = useTechnicalReports();

const viewMode = ref<'tech' | 'order'>('tech');
const expandedTechKeys = ref<Set<string>>(new Set());
const selectedOrderId = ref<string | null>(null);
const showDrawer = ref(false);
const dhlDraft = ref<number | null>(null);
const dispatchingEmails = ref(false);

const searchInput = ref('');
const debouncedSearch = refDebounced(searchInput, 250);

watch(debouncedSearch, (value) => {
  search.value = value;
  void load();
});

const selectedOrder = computed<TechnicalReportOrder | null>(
  () => allOrders.value.find((order) => order.id === selectedOrderId.value) ?? null,
);

watch(selectedOrder, (order) => {
  dhlDraft.value = order ? order.dhlShippingCost : null;
});

const isAdmin = computed(() => session.user?.role === 'ADMIN');

const weekRangeLabel = computed(() => {
  const win = report.value?.window;
  if (!win) return 'Cargando...';
  const fmt = new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    timeZone: win.timeZone,
  });
  return `Sem ${win.isoWeek} · ${fmt.format(new Date(win.start))} – ${fmt.format(new Date(win.end))}`;
});

function techGroupKey(group: { technicianId: string | null; technicianName: string }): string {
  return group.technicianId ?? `unassigned:${group.technicianName}`;
}

function toggleTechnician(key: string): void {
  const next = new Set(expandedTechKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedTechKeys.value = next;
}

function openOrderDrawer(order: TechnicalReportOrder): void {
  selectedOrderId.value = order.id;
  dhlDraft.value = order.dhlShippingCost;
  actionError.value = null;
  showDrawer.value = true;
}

async function handleSaveDhl(): Promise<void> {
  if (!selectedOrder.value) return;
  const normalized =
    dhlDraft.value === null || dhlDraft.value === undefined
      ? null
      : Number(dhlDraft.value.toFixed(2));
  const updated = await saveDhlShipping(selectedOrder.value.id, normalized);
  if (updated) {
    message.success('Envío DHL actualizado.');
  }
}

async function handleExport(technicianId?: string): Promise<void> {
  const ok = await exportExcel(technicianId);
  if (ok) {
    message.success('Excel descargado.');
  }
}

async function handleDispatchEmails(): Promise<void> {
  if (!isAdmin.value || dispatchingEmails.value) return;
  dispatchingEmails.value = true;
  try {
    const data = await dispatchTechnicianReports();
    if (data.status === 'NO_ORDERS') {
      message.info('No hay órdenes completadas en la ventana de corte para enviar.');
    } else if (data.status === 'SKIPPED') {
      message.warning(
        data.reason === 'EMAIL_SENDER_NOT_CONFIGURED'
          ? 'El servicio emisor de correos (Gmail) no está configurado en el servidor.'
          : 'Verifica que el correo de administración o consolidado esté configurado en Sincronización.',
      );
    } else if (data.status === 'SUCCESS') {
      message.success(`Se enviaron ${data.sentCount} reporte(s) por correo.`);
    } else {
      message.warning(`Enviados: ${data.sentCount}, fallidos: ${data.failedCount}.`);
    }
  } catch (err) {
    message.error(extractApiErrorMessage(err, 'No se pudieron enviar los reportes por correo.'));
  } finally {
    dispatchingEmails.value = false;
  }
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

onMounted(() => {
  void load();
});
</script>

<template>
  <app-layout>
    <section class="mx-auto max-w-4xl space-y-5">
      <!-- Header & Week Navigation -->
      <header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-slate-900">Reporte Técnico</h1>
          <p class="mt-0.5 text-sm text-slate-500">Corte semanal por técnico.</p>
        </div>

        <div class="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
          <div
            class="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white p-1 shadow-xs"
          >
            <n-button
              quaternary
              circle
              size="tiny"
              aria-label="Semana anterior"
              :disabled="loading"
              @click="changeWeek(-1)"
            >
              ◀
            </n-button>
            <span class="truncate px-2.5 text-xs font-semibold text-slate-800">
              {{ weekRangeLabel }}
            </span>
            <n-button
              quaternary
              circle
              size="tiny"
              aria-label="Semana siguiente"
              :disabled="loading || weekOffset >= 12"
              @click="changeWeek(1)"
            >
              ▶
            </n-button>
          </div>
          <n-button
            v-if="weekOffset !== 0"
            size="tiny"
            secondary
            :disabled="loading"
            @click="resetToCurrentWeek"
          >
            Hoy
          </n-button>
        </div>
      </header>

      <n-alert v-if="error" type="error" role="alert">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span>{{ error }}</span>
          <n-button size="small" @click="load">Reintentar</n-button>
        </div>
      </n-alert>

      <n-alert v-if="actionError" type="error" closable @close="actionError = null">
        {{ actionError }}
      </n-alert>

      <!-- Clean Summary Strip -->
      <n-card class="shadow-sm">
        <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Total del corte
            </p>
            <p class="mt-0.5 text-3xl font-extrabold tracking-tight text-slate-900">
              {{ formatMoney(report?.summary.grandTotal ?? 0) }}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {{ report?.summary.totalOrders ?? 0 }} orden(es) ·
              {{ report?.summary.totalTechnicians ?? 0 }} técnico(s) ·
              {{ report?.summary.totalEquipment ?? 0 }} equipo(s)
              <span v-if="report && report.summary.dhlShippingCost > 0">
                · DHL {{ formatMoney(report.summary.dhlShippingCost) }}
              </span>
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <n-button
              size="small"
              secondary
              :loading="exporting"
              :disabled="!report || report.summary.totalOrders === 0"
              @click="handleExport()"
            >
              Descargar Excel
            </n-button>
            <n-button
              v-if="isAdmin"
              size="small"
              type="primary"
              :loading="dispatchingEmails"
              @click="handleDispatchEmails"
            >
              Enviar correos
            </n-button>
          </div>
        </div>
      </n-card>

      <!-- Mode switch & search -->
      <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div class="inline-flex rounded-lg border border-slate-200 bg-slate-200/70 p-1">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
            :class="
              viewMode === 'tech'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            "
            @click="viewMode = 'tech'"
          >
            Por técnico
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
            :class="
              viewMode === 'order'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            "
            @click="viewMode = 'order'"
          >
            Por orden
          </button>
        </div>

        <n-input
          v-model:value="searchInput"
          clearable
          size="small"
          class="w-full sm:max-w-xs"
          placeholder="Buscar folio, técnico, cliente o IMEI..."
        />
      </div>

      <!-- Main List -->
      <n-spin :show="loading">
        <n-card
          v-if="!loading && (!report || report.summary.totalOrders === 0)"
          class="shadow-sm"
        >
          <n-empty description="No hay órdenes reportables en esta semana." />
        </n-card>

        <!-- Grouped by Technician (Collapsed by default) -->
        <div v-else-if="viewMode === 'tech'" class="space-y-2.5">
          <div
            v-for="group in report?.groups ?? []"
            :key="techGroupKey(group)"
            class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 cursor-pointer"
              @click="toggleTechnician(techGroupKey(group))"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-800"
                >
                  {{ initials(group.technicianName) }}
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-slate-900">
                    {{ group.technicianName }}
                  </p>
                  <p class="text-xs text-slate-500">
                    {{ group.orderCount }} orden(es) · {{ group.equipmentCount }} equipo(s)
                  </p>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-3">
                <span class="text-base font-extrabold text-slate-900 whitespace-nowrap">
                  {{ formatMoney(group.total) }}
                </span>
                <span class="text-xs text-slate-400">
                  {{ expandedTechKeys.has(techGroupKey(group)) ? '▲' : '▼' }}
                </span>
              </div>
            </button>

            <div
              v-if="expandedTechKeys.has(techGroupKey(group))"
              class="border-t border-slate-100"
            >
              <div
                class="flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 px-4 py-2 text-xs text-slate-500"
              >
                <span>
                  Serv. {{ formatMoney(group.baseCost) }} · Viát.
                  {{ formatMoney(group.travelExpenses) }}
                  <span v-if="group.dhlShippingCost > 0">
                    · DHL {{ formatMoney(group.dhlShippingCost) }}
                  </span>
                </span>
                <n-button
                  v-if="group.technicianId"
                  size="tiny"
                  quaternary
                  :loading="exporting"
                  @click.stop="handleExport(group.technicianId)"
                >
                  Descargar Excel de técnico
                </n-button>
              </div>

              <div class="divide-y divide-slate-100">
                <button
                  v-for="order in group.orders"
                  :key="order.id"
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-blue-50/40 cursor-pointer"
                  @click="openOrderDrawer(order)"
                >
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-mono text-xs font-bold text-slate-900">
                        {{ order.folio }}
                      </span>
                      <n-tag
                        size="tiny"
                        round
                        :type="order.status === 'FAILED_APPOINTMENT' ? 'warning' : 'info'"
                      >
                        {{ order.serviceLabel }}
                      </n-tag>
                      <n-tag v-if="order.dhlShippingCost > 0" size="tiny" round type="success">
                        DHL {{ formatMoney(order.dhlShippingCost) }}
                      </n-tag>
                    </div>
                    <p class="mt-0.5 truncate text-xs text-slate-500">
                      {{ order.clientName }} · {{ formatShortDate(order.scheduledAt) }}
                    </p>
                  </div>
                  <span class="shrink-0 text-sm font-bold text-slate-900 whitespace-nowrap">
                    {{ formatMoney(order.total) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Flat Chronological Order List -->
        <div
          v-else
          class="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-xs"
        >
          <button
            v-for="order in allOrders"
            :key="order.id"
            type="button"
            class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-blue-50/40 cursor-pointer"
            @click="openOrderDrawer(order)"
          >
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-bold text-slate-900">{{ order.folio }}</span>
                <n-tag
                  size="tiny"
                  round
                  :type="order.status === 'FAILED_APPOINTMENT' ? 'warning' : 'info'"
                >
                  {{ order.serviceLabel }}
                </n-tag>
                <n-tag v-if="order.dhlShippingCost > 0" size="tiny" round type="success">
                  DHL {{ formatMoney(order.dhlShippingCost) }}
                </n-tag>
              </div>
              <p class="mt-0.5 truncate text-xs text-slate-500">
                {{ order.technicianName }} · {{ order.clientName }} ·
                {{ formatShortDate(order.scheduledAt) }}
              </p>
            </div>
            <span class="shrink-0 text-sm font-bold text-slate-900 whitespace-nowrap">
              {{ formatMoney(order.total) }}
            </span>
          </button>
        </div>
      </n-spin>

      <!-- Overlay Detail Drawer -->
      <n-drawer v-model:show="showDrawer" :width="440" placement="right">
        <n-drawer-content
          :title="selectedOrder ? `Orden ${selectedOrder.folio}` : 'Detalle de orden'"
          closable
        >
          <div v-if="selectedOrder" class="space-y-5">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-slate-900">{{ selectedOrder.clientName }}</p>
                <p class="text-xs text-slate-500">
                  Programada: {{ formatShortDate(selectedOrder.scheduledAt) }}
                  <span v-if="selectedOrder.completedAt">
                    · Cerrada: {{ formatShortDate(selectedOrder.completedAt) }}
                  </span>
                </p>
              </div>
              <router-link
                v-if="isAdmin"
                :to="`/orders/${selectedOrder.id}`"
                class="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
              >
                Abrir orden →
              </router-link>
            </div>

            <div class="rounded-lg border border-slate-200 p-3">
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Técnico y datos fiscales
              </p>
              <p class="mt-1 text-sm font-semibold text-slate-900">
                {{ selectedOrder.technicianName }}
              </p>
              <p v-if="selectedOrder.technicianLegalName" class="text-xs text-slate-600">
                Razón social: {{ selectedOrder.technicianLegalName }}
              </p>
              <p v-if="selectedOrder.technicianTaxData" class="text-xs text-slate-600">
                Datos fiscales / RFC: {{ selectedOrder.technicianTaxData }}
              </p>
            </div>

            <div>
              <p class="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Unidades y equipos ({{ selectedOrder.unitsCount }})
              </p>
              <n-empty
                v-if="selectedOrder.units.length === 0"
                size="small"
                description="Sin unidades registradas en esta orden."
              />
              <div v-else class="space-y-2">
                <div
                  v-for="unit in selectedOrder.units"
                  :key="unit.id"
                  class="rounded-lg border border-slate-200 p-3 text-xs"
                >
                  <div class="font-semibold text-slate-900">
                    {{ unit.label }}
                    <span class="ml-1 font-mono font-normal text-slate-500">
                      · {{ unit.serialNumber }}
                    </span>
                  </div>
                  <div v-if="unit.equipmentIdentifiers.length" class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-for="eqId in unit.equipmentIdentifiers"
                      :key="eqId"
                      class="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                    >
                      {{ eqId }}
                    </span>
                  </div>
                  <p v-else class="mt-1 text-slate-400">Sin equipo asignado</p>
                </div>
              </div>
            </div>

            <div class="rounded-lg border border-slate-200 p-3 space-y-2 text-sm">
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Liquidación
              </p>
              <div class="flex justify-between">
                <span class="text-slate-600">Servicio ({{ selectedOrder.serviceLabel }})</span>
                <span class="font-semibold">{{ formatMoney(selectedOrder.baseCost) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-600">Viáticos</span>
                <span class="font-semibold">{{ formatMoney(selectedOrder.travelExpenses) }}</span>
              </div>
              <div class="flex items-center justify-between gap-2 pt-1">
                <span class="text-slate-600">Envío DHL (MXN)</span>
                <div class="flex items-center gap-1.5">
                  <n-input-number
                    v-model:value="dhlDraft"
                    size="small"
                    :min="0"
                    :precision="2"
                    :show-button="false"
                    class="w-28"
                    placeholder="0.00"
                  />
                  <n-button
                    size="small"
                    type="primary"
                    secondary
                    :loading="savingDhl"
                    @click="handleSaveDhl"
                  >
                    Guardar
                  </n-button>
                </div>
              </div>
              <div
                class="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900"
              >
                <span>Total orden</span>
                <span class="text-emerald-700">{{ formatMoney(selectedOrder.total) }}</span>
              </div>
            </div>

            <div v-if="selectedOrder.notes" class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <strong class="text-slate-800">Notas:</strong> {{ selectedOrder.notes }}
            </div>
          </div>
        </n-drawer-content>
      </n-drawer>
    </section>
  </app-layout>
</template>
