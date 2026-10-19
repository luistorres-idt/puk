<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NInput,
  NModal,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui';
import { MAX_ORDER_NOTES_LENGTH, canAddOrderItems, type OrderServiceType } from '@puk/contracts';
import { fetchReportDownload } from '../api.js';
import AddOrderUnitModal from '../components/AddOrderUnitModal.vue';
import AttachOrderEquipmentModal from '../components/AttachOrderEquipmentModal.vue';
import OrderUnitsTab from '../components/OrderUnitsTab.vue';
import OrderAuditTab from '../components/OrderAuditTab.vue';
import OrderEvidenceTab from '../components/OrderEvidenceTab.vue';
import OrderPricingModal from '../components/OrderPricingModal.vue';
import OrderReportCard from '../components/OrderReportCard.vue';
import OrderSyncTab from '../components/OrderSyncTab.vue';
import { useOrderMedia } from '../composables/useOrderMedia.js';
import { formatOrderStatus, formatServiceType, orderStatusTagType } from '../formatters.js';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import { TechnicianSelect } from '@/modules/technicians';
import { useSessionStore } from '@/stores/session';
import {
  useOrderAuditQuery,
  useOrderMutations,
  useOrderQuery,
  useOrderReportQuery,
  useOrderReportVersionsQuery,
  useSyncStatusQuery,
} from '../queries';
import { releasePrivateFileUrl, requireCorrection } from '@/modules/service-execution';
import { getDisabledScheduleTimes, isPastCalendarDate } from '../reschedule-schedule.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const message = useMessage();

const orderId = String(route.params.id);

// Queries
const orderQuery = useOrderQuery(orderId);
const syncQuery = useSyncStatusQuery(orderId);
const auditQuery = useOrderAuditQuery(orderId);
const reportQuery = useOrderReportQuery(orderId);
const reportVersionsQuery = useOrderReportVersionsQuery(orderId);
const mutations = useOrderMutations(orderId);

const order = computed(() => orderQuery.data.value);
const isAdmin = computed(() => session.user?.role === 'ADMIN');
const isFailedAppointment = computed(() => order.value?.status === 'FAILED_APPOINTMENT');
const canAddItems = computed(() => isAdmin.value && !!order.value && canAddOrderItems(order.value));
const canAssignOrder = computed(
  () =>
    isAdmin.value &&
    (order.value?.status === 'DRAFT' || order.value?.status === 'REQUIRES_CORRECTION'),
);
const canRequestCorrection = computed(() => isAdmin.value && order.value?.status === 'COMPLETED');
const canEnterTechnicalMode = computed(
  () =>
    !!order.value &&
    order.value.status !== 'DRAFT' &&
    order.value.status !== 'COMPLETED' &&
    order.value.status !== 'FAILED_APPOINTMENT' &&
    order.value.status !== 'CANCELLED',
);
const canResolveFailedAppointment = computed(
  () => isAdmin.value && isFailedAppointment.value && !order.value?.failedAppointmentResolution,
);
const canCancelOrder = computed(
  () =>
    isAdmin.value &&
    !!order.value &&
    order.value.status !== 'COMPLETED' &&
    order.value.status !== 'CANCELLED' &&
    !order.value.failedAppointmentResolution,
);
const canManagePricing = computed(
  () => isAdmin.value && !!order.value && order.value.status !== 'CANCELLED',
);
const isOrderFinalized = computed(
  () => order.value?.status === 'COMPLETED' || order.value?.status === 'FAILED_APPOINTMENT',
);
const hasPricingOverrides = computed(() => {
  const o = order.value?.pricingOverrides;
  if (!o) return false;
  const hasRates = Boolean(o.rates && Object.keys(o.rates).length > 0);
  const hasTravel = o.travelExpenses !== undefined && o.travelExpenses !== null;
  return hasRates || hasTravel;
});
const syncInfo = computed(() => syncQuery.data.value);
const auditLogs = computed(() => auditQuery.data.value ?? []);
const report = computed(() => reportQuery.data.value);
const reportVersions = computed(() => reportVersionsQuery.data.value ?? []);
watch(
  () => [report.value?.version, report.value?.status],
  () => {
    if (report.value?.status === 'READY') void reportVersionsQuery.refetch();
  },
);

const activeTab = ref('units');

// Modal states
const addUnitModalRef = ref<InstanceType<typeof AddOrderUnitModal> | null>(null);
const attachEquipmentModalRef = ref<InstanceType<typeof AttachOrderEquipmentModal> | null>(null);
const orderPricingModalRef = ref<InstanceType<typeof OrderPricingModal> | null>(null);
const showCancelModal = ref(false);
const showCorrectionModal = ref(false);
const showRescheduleModal = ref(false);

function openPricingModal() {
  orderPricingModalRef.value?.openPricingModal();
}
const {
  showImageModal,
  previewImageUrl,
  previewImageTitle,
  evidenceUrls,
  loadingEvidenceUrls,
  signatureUrl,
  viewEvidence,
  viewSignature,
} = useOrderMedia({
  orderId,
  order,
  activeTab,
  notifyError: (error, fallback) => message.error(getErrorMessage(error, fallback)),
});

const cancelReason = ref('');
const correctionNotes = ref('');
const rescheduleAtTimestamp = ref<number>(Date.now() + 86400000);
const rescheduleTechnicianId = ref<string | null>(null);
const distinctServices = computed(() => {
  if (!order.value) return [];
  const fromUnits = (order.value.units ?? [])
    .map((u) => u.serviceType ?? order.value?.serviceType)
    .filter((type): type is OrderServiceType => type !== undefined);
  if (fromUnits.length > 0) {
    return Array.from(new Set(fromUnits));
  }
  return order.value.serviceType ? [order.value.serviceType] : [];
});

const assignedEquipmentKeys = computed<string[]>(() => {
  const keys = new Set<string>();
  if (!order.value?.units) return [];
  for (const unit of order.value.units) {
    if (unit.equipment) {
      for (const eq of unit.equipment) {
        if (eq.externalKey) {
          keys.add(eq.externalKey);
        }
      }
    }
  }
  return Array.from(keys);
});

const pricingBreakdownItems = computed(() => {
  return order.value?.pricingBreakdown?.breakdown ?? [];
});

const pricingTravelExpenses = computed(() => {
  return order.value?.pricingBreakdown?.travelExpenses ?? null;
});

const pricingWarnings = computed<string[]>(() => {
  return order.value?.pricingBreakdown?.warnings ?? [];
});

function getErrorMessage(err: unknown, defaultMsg: string): string {
  return extractApiErrorMessage(err, defaultMsg);
}

function openAddUnitModal() {
  addUnitModalRef.value?.openAddUnitModal();
}

// Actions
async function handleDeleteUnit(unitId: string) {
  try {
    await mutations.removeUnit.mutateAsync({ id: orderId, unitId });
    message.success('Unidad eliminada.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al eliminar unidad'));
  }
}

function openAddEquipment(unitId: string) {
  attachEquipmentModalRef.value?.openAddEquipment(unitId);
}

async function handleRemoveEquipment(unitId: string, equipmentId: string) {
  try {
    await mutations.detachEquipment.mutateAsync({ id: orderId, unitId, equipmentId });
    message.success('Equipo removido de la unidad.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al desasignar equipo'));
  }
}

async function handleAssignAndSync() {
  try {
    await mutations.assign.mutateAsync(orderId);
    message.success('Orden asignada y encolada para sincronización.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al asignar orden'));
  }
}

async function handleCancelOrder() {
  const wasFailedAppointment = isFailedAppointment.value;
  try {
    await mutations.cancel.mutateAsync({ id: orderId, reason: cancelReason.value || undefined });
    showCancelModal.value = false;
    message.success(
      wasFailedAppointment
        ? 'La cita fallida quedó cerrada administrativamente.'
        : 'Orden cancelada exitosamente.',
    );
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al cancelar orden'));
  }
}

function openRescheduleModal() {
  rescheduleAtTimestamp.value = Date.now() + 86400000;
  rescheduleTechnicianId.value = order.value?.technician?.id ?? null;
  showRescheduleModal.value = true;
}

async function handleRescheduleOrder() {
  if (!order.value || !rescheduleAtTimestamp.value) return;
  if (!rescheduleTechnicianId.value) {
    message.warning('Selecciona un técnico activo.');
    return;
  }
  if (rescheduleAtTimestamp.value <= Date.now()) {
    message.warning('Selecciona una fecha y hora futuras.');
    return;
  }
  try {
    const created = await mutations.reschedule.mutateAsync({
      id: orderId,
      data: {
        scheduledAt: new Date(rescheduleAtTimestamp.value).toISOString(),
        technicianId: rescheduleTechnicianId.value,
        version: order.value.version,
      },
    });
    showRescheduleModal.value = false;
    message.success(`Orden ${created.folio} creada como borrador.`);
    await router.push(`/orders/${created.id}`);
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al reprogramar la cita'));
  }
}

async function handleRetrySync() {
  try {
    const res = await mutations.retry.mutateAsync(orderId);
    message.info(`Reintento ejecutado: ${res.retriedCount} operaciones reintentadas.`);
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al reintentar sincronización'));
  }
}

async function handleGenerateReport() {
  try {
    await mutations.requestReport.mutateAsync(orderId);
    await reportQuery.refetch();
    await reportVersionsQuery.refetch();
    message.success('La generación del reporte fue solicitada.');
  } catch (err) {
    message.error(getErrorMessage(err, 'No fue posible solicitar el reporte'));
  }
}

async function handleDownloadReport(version?: number) {
  try {
    const download = await fetchReportDownload(orderId, version);
    const link = document.createElement('a');
    link.href = download.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = download.fileName;
    link.click();
    if (download.url.startsWith('blob:')) {
      window.setTimeout(() => releasePrivateFileUrl(download.url), 60_000);
    }
  } catch (err) {
    message.error(getErrorMessage(err, 'No fue posible descargar el reporte'));
  }
}

async function handleRequestCorrection() {
  if (!correctionNotes.value.trim()) {
    message.warning('Por favor ingresa los motivos de la corrección.');
    return;
  }
  if (correctionNotes.value.length > MAX_ORDER_NOTES_LENGTH) {
    message.error(
      `Las notas no pueden superar ${MAX_ORDER_NOTES_LENGTH.toLocaleString('es-MX')} caracteres.`,
    );
    return;
  }
  try {
    await requireCorrection(orderId, { notes: correctionNotes.value.trim() });
    showCorrectionModal.value = false;
    correctionNotes.value = '';
    orderQuery.refetch();
    auditQuery.refetch();
    message.success('Orden devuelta para corrección técnica.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al solicitar corrección'));
  }
}

const statusColor = orderStatusTagType;
</script>

<template>
  <app-layout>
    <div
      data-tour-page="detail"
      :data-tour-ready="!!order && !orderQuery.isPending.value"
      :data-tour-error="orderQuery.isError.value"
      :data-tour-status="order?.status"
      class="space-y-6"
    >
      <!-- Loading State -->
      <div v-if="orderQuery.isPending.value" class="grid min-h-64 place-items-center">
        <n-spin size="large" />
      </div>

      <!-- Error State -->
      <n-alert v-else-if="orderQuery.isError.value" type="error">
        No fue posible cargar el detalle de la orden. Verifica tus permisos o conexión.
      </n-alert>

      <template v-else-if="order">
        <!-- Header & Action Bar -->
        <div
          data-tour="order-information"
          class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div class="flex flex-wrap items-center gap-3">
            <n-button secondary @click="router.push('/orders')">← Volver</n-button>
            <h1 class="text-2xl font-bold text-slate-800">
              Orden <span class="font-mono text-indigo-700">{{ order.folio }}</span>
            </h1>
            <n-tag :type="statusColor(order.status)" round>
              {{ formatOrderStatus(order.status) }}
            </n-tag>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-2">
            <n-button
              v-if="canAssignOrder"
              type="primary"
              :loading="mutations.assign.isPending.value"
              @click="handleAssignAndSync"
            >
              Asignar y Sincronizar
            </n-button>

            <n-button
              v-if="canRequestCorrection"
              type="warning"
              secondary
              @click="showCorrectionModal = true"
            >
              Solicitar Corrección
            </n-button>

            <n-button
              v-if="canEnterTechnicalMode"
              type="info"
              secondary
              @click="router.push(`/orders/${order.id}/execute`)"
            >
              Modo Técnico →
            </n-button>

            <n-button v-if="canManagePricing" type="primary" secondary @click="openPricingModal">
              {{ isOrderFinalized ? 'Ajustar Precios' : 'Configurar Tarifas' }}
            </n-button>

            <n-button
              v-if="canResolveFailedAppointment"
              type="warning"
              secondary
              @click="openRescheduleModal"
            >
              Reprogramar
            </n-button>

            <n-button v-if="canCancelOrder" type="error" secondary @click="showCancelModal = true">
              {{ order.status === 'FAILED_APPOINTMENT' ? 'Cancelar Servicio' : 'Cancelar Orden' }}
            </n-button>
          </div>
        </div>

        <n-alert
          v-if="order.status === 'FAILED_APPOINTMENT'"
          type="error"
          title="Motivo de la cita fallida"
        >
          {{ order.failedReason || 'No se registró un motivo.' }}
        </n-alert>

        <n-alert
          v-if="order.status === 'FAILED_APPOINTMENT' && order.failedAppointmentResolution"
          :type="order.failedAppointmentResolution === 'RESCHEDULED' ? 'info' : 'warning'"
          :title="
            order.failedAppointmentResolution === 'RESCHEDULED'
              ? 'Cita reprogramada'
              : 'Servicio cancelado'
          "
        >
          <span
            v-if="order.failedAppointmentResolution === 'RESCHEDULED' && order.rescheduledOrder"
          >
            Se creó la orden
            <n-button
              text
              type="primary"
              @click="router.push(`/orders/${order.rescheduledOrder?.id}`)"
            >
              {{ order.rescheduledOrder.folio }}
            </n-button>
            como borrador.
          </span>
          <span v-else>
            La cita fallida quedó cerrada administrativamente sin alterar su cobro ni historial.
            <span v-if="order.failedAppointmentResolutionReason" class="block mt-2">
              <strong>Motivo de cancelación:</strong>
              {{ order.failedAppointmentResolutionReason }}
            </span>
          </span>
        </n-alert>

        <n-alert v-if="order.rescheduledFrom" type="info" title="Orden reprogramada">
          Esta orden fue creada a partir de la cita fallida
          <n-button
            text
            type="primary"
            @click="router.push(`/orders/${order.rescheduledFrom?.id}`)"
          >
            {{ order.rescheduledFrom.folio }}
          </n-button>
          y comienza con datos de ejecución limpios.
        </n-alert>

        <order-report-card
          v-if="order.status === 'COMPLETED'"
          data-tour="order-report"
          :order-id="orderId"
          :report="report"
          :report-versions="reportVersions"
          :is-admin="isAdmin"
          :request-pending="mutations.requestReport.isPending.value"
          @generate="handleGenerateReport"
          @download="handleDownloadReport"
          @refresh="() => reportQuery.refetch()"
        />

        <!-- General Order Information -->
        <n-card class="shadow-sm">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span class="text-xs text-slate-500 block">Cliente</span>
              <span class="font-bold text-slate-800 text-base">{{ order.clientNameSnapshot }}</span>
              <span class="text-xs text-slate-400 block font-mono"
                >ID Hoja: {{ order.clientSheetId }}</span
              >
            </div>
            <div>
              <span class="text-xs text-slate-500 block">Tipo de Servicio</span>
              <div class="flex flex-wrap gap-1 mt-1">
                <n-tag v-for="svc in distinctServices" :key="svc" size="small" type="info" round>
                  {{ formatServiceType(svc) }}
                </n-tag>
                <span v-if="distinctServices.length === 0" class="text-slate-400 italic">
                  Sin servicios definidos
                </span>
              </div>
              <span class="text-xs text-slate-500 block mt-1">
                {{ order.isHomeService ? 'A domicilio' : 'En taller' }}
                {{ order.serviceAddress ? `(${order.serviceAddress})` : '' }}
              </span>
            </div>
            <div>
              <span class="text-xs text-slate-500 block">Técnico Asignado</span>
              <span class="font-semibold text-slate-800">{{
                order.technician?.name || 'Sin asignar'
              }}</span>
              <span class="text-xs text-slate-400 block">
                Cita: {{ new Date(order.scheduledAt).toLocaleString() }}
              </span>
              <div v-if="canManagePricing && !order.pricingBreakdown" class="mt-1">
                <button
                  type="button"
                  class="text-[11px] text-blue-600 hover:text-blue-800 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
                  @click="openPricingModal"
                >
                  <span>{{
                    hasPricingOverrides
                      ? 'Tarifas acordadas configuradas'
                      : 'Configurar tarifas para esta orden'
                  }}</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="order.pricingBreakdown"
            class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600"
          >
            <!-- Warning banner if any tariff was $0 / missing -->
            <div
              v-if="pricingWarnings.length > 0"
              class="mb-3 p-2.5 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs"
            >
              <div class="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                <span>⚠️</span>
                <span>Aviso de tarifas no configuradas para el técnico:</span>
              </div>
              <ul class="list-disc list-inside space-y-0.5 pl-1">
                <li v-for="(warn, wIdx) in pricingWarnings" :key="wIdx">
                  {{ warn }}
                </li>
              </ul>
            </div>

            <div class="flex justify-between items-center mb-1">
              <div class="flex items-center gap-2">
                <strong class="text-slate-700">Desglose de Liquidación Técnica:</strong>
                <n-button
                  v-if="canManagePricing"
                  size="tiny"
                  type="primary"
                  secondary
                  @click="openPricingModal"
                >
                  {{ isOrderFinalized ? 'Ajustar Precios' : 'Configurar Tarifas' }}
                </n-button>
              </div>
              <span class="font-bold text-slate-800 text-sm">
                Total: ${{ Number(order.pricingTotal ?? 0).toFixed(2) }} MXN
              </span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              <div
                v-for="(item, idx) in pricingBreakdownItems"
                :key="idx"
                class="bg-slate-50 p-2 rounded border border-slate-200"
                :class="{
                  'border-amber-300 bg-amber-50/50': Number(item.rate) === 0,
                }"
              >
                <div class="font-medium text-slate-700 flex justify-between items-center">
                  <span>{{ formatServiceType(item.serviceType) }}</span>
                  <span
                    v-if="Number(item.rate) === 0"
                    class="text-[10px] text-amber-700 font-semibold bg-amber-100 px-1 py-0.5 rounded"
                  >
                    Tarifa $0.00
                  </span>
                </div>
                <div class="text-[11px] text-slate-500">
                  {{ item.quantity }} unidad(es) @ ${{ Number(item.rate).toFixed(2) }}
                  =
                  <span class="font-semibold text-slate-800"
                    >${{ Number(item.subtotal).toFixed(2) }}</span
                  >
                </div>
              </div>
              <div
                v-if="Number(pricingTravelExpenses) > 0"
                class="bg-slate-50 p-2 rounded border border-slate-200"
              >
                <div class="font-medium text-slate-700">Viático / Salida</div>
                <div class="text-[11px] text-slate-500">
                  Costo de salida =
                  <span class="font-semibold text-slate-800">
                    ${{ Number(pricingTravelExpenses).toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
            <div
              v-if="order.pricingOverrides?.reason"
              class="mt-2 text-[11px] text-slate-500 italic"
            >
              <strong>Motivo de ajuste:</strong> {{ order.pricingOverrides.reason }}
            </div>
          </div>
          <div
            v-if="order.generalNotes"
            class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600"
          >
            <strong>Notas generales:</strong> {{ order.generalNotes }}
          </div>
        </n-card>

        <!-- Tabs Section -->
        <n-tabs v-model:value="activeTab" data-tour="order-tabs" type="line" animated>
          <!-- Tab 1: Unidades y Equipos -->
          <n-tab-pane name="units" tab="Unidades y Equipos">
            <order-units-tab
              :order="order"
              :can-add-items="canAddItems"
              :is-admin="isAdmin"
              @add-unit="openAddUnitModal"
              @attach-equipment="openAddEquipment"
              @delete-unit="handleDeleteUnit"
              @remove-equipment="handleRemoveEquipment"
            />
          </n-tab-pane>

          <!-- Tab 2: Evidencias y Firma -->
          <n-tab-pane name="evidence" tab="Evidencias y Firma">
            <order-evidence-tab
              :order="order"
              :signature-url="signatureUrl"
              :evidence-urls="evidenceUrls"
              :loading-evidence-urls="loadingEvidenceUrls"
              @view-signature="viewSignature"
              @view-evidence="viewEvidence"
            />
          </n-tab-pane>

          <!-- Tab 3: Auditoría -->
          <n-tab-pane name="audit" tab="Registro de Auditoría">
            <order-audit-tab
              :audit-logs="auditLogs"
              :is-pending="auditQuery.isPending.value"
              @refresh="() => auditQuery.refetch()"
            />
          </n-tab-pane>

          <!-- Tab 4: Sincronización con Sheets -->
          <n-tab-pane name="sync" tab="Sincronización Sheets">
            <order-sync-tab
              :sync-info="syncInfo"
              :is-pending="syncQuery.isPending.value"
              :is-admin="isAdmin"
              :retry-pending="mutations.retry.isPending.value"
              @retry="handleRetrySync"
            />
          </n-tab-pane>
        </n-tabs>
      </template>

      <add-order-unit-modal
        ref="addUnitModalRef"
        :order-id="orderId"
        :order="order"
        :can-add-items="canAddItems"
        :assigned-equipment-keys="assignedEquipmentKeys"
        :insert-unit="mutations.insertUnit.mutateAsync"
        :insert-unit-pending="mutations.insertUnit.isPending.value"
      />

      <attach-order-equipment-modal
        ref="attachEquipmentModalRef"
        :order-id="orderId"
        :order="order"
        :can-add-items="canAddItems"
        :assigned-equipment-keys="assignedEquipmentKeys"
        :attach-equipment="mutations.attachEquipment.mutateAsync"
        :attach-equipment-pending="mutations.attachEquipment.isPending.value"
      />

      <!-- Modal: Cancel Order -->
      <n-modal
        v-model:show="showCancelModal"
        preset="card"
        :title="isFailedAppointment ? 'Cancelar Servicio' : 'Cancelar Orden de Servicio'"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-4">
          <p class="text-sm text-slate-600">
            <template v-if="isFailedAppointment">
              La cita fallida conservará su motivo, cobro, reporte e historial, pero quedará cerrada
              administrativamente y ya no podrá reprogramarse.
            </template>
            <template v-else>
              ¿Estás seguro de cancelar esta orden? Los equipos asignados serán liberados para su
              uso en otras órdenes.
            </template>
          </p>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1"
              >Motivo de la Cancelación</label
            >
            <n-input
              v-model:value="cancelReason"
              type="textarea"
              placeholder="Razón de la cancelación..."
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <n-button @click="showCancelModal = false">Cerrar</n-button>
            <n-button
              type="error"
              :loading="mutations.cancel.isPending.value"
              @click="handleCancelOrder"
            >
              Confirmar Cancelación
            </n-button>
          </div>
        </div>
      </n-modal>

      <!-- Modal: Reschedule Failed Appointment -->
      <n-modal
        v-model:show="showRescheduleModal"
        preset="card"
        title="Reprogramar Cita Fallida"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-4">
          <p class="text-sm text-slate-600">
            Se creará una copia de esta orden en estado borrador. La cita fallida conservará su
            motivo, cobro, reporte e historial.
          </p>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Nueva fecha y hora</label>
            <n-date-picker
              v-model:value="rescheduleAtTimestamp"
              type="datetime"
              class="w-full"
              :is-date-disabled="isPastCalendarDate"
              :is-time-disabled="getDisabledScheduleTimes"
            />
          </div>
          <technician-select
            v-model="rescheduleTechnicianId"
            :disabled="mutations.reschedule.isPending.value"
          />
          <div class="flex justify-end gap-2 pt-2">
            <n-button @click="showRescheduleModal = false">Cerrar</n-button>
            <n-button
              type="warning"
              :loading="mutations.reschedule.isPending.value"
              :disabled="!rescheduleTechnicianId"
              @click="handleRescheduleOrder"
            >
              Crear Orden Borrador
            </n-button>
          </div>
        </div>
      </n-modal>

      <!-- Modal: Require Correction -->
      <n-modal
        v-model:show="showCorrectionModal"
        preset="card"
        title="Solicitar Corrección Técnica"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-4">
          <p class="text-sm text-slate-600">
            Devuelve la orden al estado REQUIRES_CORRECTION para que el técnico atienda
            observaciones.
          </p>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1"
              >Observaciones o Requisitos</label
            >
            <n-input
              v-model:value="correctionNotes"
              type="textarea"
              placeholder="Indica qué evidencias, firmas o checklist deben corregirse..."
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <n-button @click="showCorrectionModal = false">Cerrar</n-button>
            <n-button type="warning" @click="handleRequestCorrection">
              Devolver a Corrección
            </n-button>
          </div>
        </div>
      </n-modal>

      <!-- Modal: Image Preview -->
      <n-modal
        v-model:show="showImageModal"
        preset="card"
        :title="previewImageTitle"
        class="w-[92vw] max-w-2xl"
      >
        <div class="flex justify-center p-2">
          <img
            v-if="previewImageUrl"
            :src="previewImageUrl"
            alt="Evidencia / Firma"
            class="max-h-[70vh] rounded-lg object-contain"
          />
        </div>
      </n-modal>

      <!-- Modal: Order Pricing Adjustment / Configuration -->
      <order-pricing-modal
        ref="orderPricingModalRef"
        :order-id="orderId"
        :order="order"
        :update-pricing="mutations.updatePricing.mutateAsync"
        :update-pricing-pending="mutations.updatePricing.isPending.value"
        @saved="() => orderQuery.refetch()"
      />
    </div>
  </app-layout>
</template>
