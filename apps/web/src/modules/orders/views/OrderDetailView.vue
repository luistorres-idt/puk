<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NEmpty,
  NImage,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui';
import {
  MIN_REQUIRED_EVIDENCE_PHOTOS,
  ORDER_SERVICE_LABELS,
  OrderServiceTypeSchema,
  canAddOrderItems,
  isServiceConfigurationSupported,
  type ExternalEquipment,
  type OrderServiceType,
} from '@puk/contracts';
import { fetchReportDownload, type UnitItem } from '../api.js';
import {
  CATEGORY_NAMES,
  formatEquipmentStatus,
  formatOrderStatus,
  formatServiceType,
  formatUnitStatus,
  orderStatusTagType,
  unitStatusTagType,
} from '../formatters.js';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import {
  EquipmentSelect,
  extractUnitFromEquipment,
  toEquipmentAssignment,
} from '@/modules/external-catalogs';
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
import {
  getEvidenceUrl,
  getSignatureUrl,
  getStorageMode,
  releasePrivateFileUrl,
  requireCorrection,
} from '@/modules/service-execution';
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
const syncInfo = computed(() => syncQuery.data.value);
const auditLogs = computed(() => auditQuery.data.value ?? []);
const report = computed(() => reportQuery.data.value);
const reportVersions = computed(() => reportVersionsQuery.data.value ?? []);
const driveMode = ref(false);

watch(
  () => [report.value?.version, report.value?.status],
  () => {
    if (report.value?.status === 'READY') void reportVersionsQuery.refetch();
  },
);

onMounted(async () => {
  try {
    driveMode.value = (await getStorageMode()) === 'drive';
  } catch {
    driveMode.value = false;
  }
});

const activeTab = ref('units');

// Modal states
const showAddUnitModal = ref(false);
const showAddEqModal = ref(false);
const showCancelModal = ref(false);
const showCorrectionModal = ref(false);
const showRescheduleModal = ref(false);
const showImageModal = ref(false);
const previewImageUrl = ref<string | null>(null);
const previewImageTitle = ref<string>('');

const cancelReason = ref('');
const correctionNotes = ref('');
const rescheduleAtTimestamp = ref<number>(Date.now() + 86400000);
const rescheduleTechnicianId = ref<string | null>(null);
const targetUnitId = ref<string | null>(null);

const targetUnit = computed(() => order.value?.units?.find((u) => u.id === targetUnitId.value));

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

const serviceTypeOptions = OrderServiceTypeSchema.options
  .filter((value) => value !== 'FAILED_APPOINTMENT')
  .map((value) => ({
    label: `${ORDER_SERVICE_LABELS[value]}${isServiceConfigurationSupported(value) ? '' : ' (próximamente)'}`,
    value,
    disabled: !isServiceConfigurationSupported(value),
  }));

// Unit form
const newUnit = ref({
  label: '',
  makeModel: '',
  serialNumber: '',
  year: 2024 as number | null,
  serviceType: 'INSTALLATION' as OrderServiceType,
});

// Equipment form for the separate Attach Equipment modal (showAddEqModal)
const selectedEquipmentKey = ref<string | null>(null);
const selectedEquipment = ref<ExternalEquipment | null>(null);

// Equipment form for the Add Unit modal (showAddUnitModal)
const unitModalEquipmentKey = ref<string | null>(null);
const unitModalEquipment = ref<ExternalEquipment | null>(null);

const isReviewOrUninstallation = computed(
  () => newUnit.value.serviceType === 'REVIEW' || newUnit.value.serviceType === 'UNINSTALLATION',
);

const isEquipmentReplacement = computed(
  () => newUnit.value.serviceType === 'EQUIPMENT_REPLACEMENT',
);

const replacementNewEquipmentKey = ref<string | null>(null);
const replacementNewEquipment = ref<ExternalEquipment | null>(null);

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

const excludeKeysForModalReplacementOld = computed(() => {
  const keys = [...assignedEquipmentKeys.value];
  if (replacementNewEquipmentKey.value) {
    keys.push(replacementNewEquipmentKey.value);
  }
  return keys;
});

const excludeKeysForModalReplacementNew = computed(() => {
  const keys = [...assignedEquipmentKeys.value];
  if (unitModalEquipmentKey.value) {
    keys.push(unitModalEquipmentKey.value);
  }
  return keys;
});

function handleReplacementNewSelect(eq: ExternalEquipment | null) {
  replacementNewEquipment.value = eq;
}

function handleUnitModalEquipmentSelect(eq: ExternalEquipment | null) {
  unitModalEquipment.value = eq;
  if (eq && (isReviewOrUninstallation.value || isEquipmentReplacement.value)) {
    const extracted = extractUnitFromEquipment(eq);
    newUnit.value.label = extracted.label;
    newUnit.value.makeModel = extracted.makeModel;
    newUnit.value.serialNumber = extracted.serialNumber;
    newUnit.value.year = extracted.year;
  }
}

watch(
  () => newUnit.value.serviceType,
  (newType) => {
    unitModalEquipmentKey.value = null;
    unitModalEquipment.value = null;
    replacementNewEquipmentKey.value = null;
    replacementNewEquipment.value = null;
    if (
      newType === 'REVIEW' ||
      newType === 'UNINSTALLATION' ||
      newType === 'EQUIPMENT_REPLACEMENT'
    ) {
      newUnit.value.label = '';
      newUnit.value.makeModel = '';
      newUnit.value.serialNumber = '';
      newUnit.value.year = new Date().getFullYear();
    }
  },
);

function openAddUnitModal() {
  if (!canAddItems.value) return;
  const defaultService =
    order.value?.serviceType && order.value.serviceType !== 'FAILED_APPOINTMENT'
      ? order.value.serviceType
      : 'INSTALLATION';
  newUnit.value = {
    label: '',
    makeModel: '',
    serialNumber: '',
    year: new Date().getFullYear(),
    serviceType: defaultService as OrderServiceType,
  };
  unitModalEquipmentKey.value = null;
  unitModalEquipment.value = null;
  replacementNewEquipmentKey.value = null;
  replacementNewEquipment.value = null;
  showAddUnitModal.value = true;
}

function getErrorMessage(err: unknown, defaultMsg: string): string {
  return extractApiErrorMessage(err, defaultMsg);
}

// Actions
async function handleAddUnit() {
  if (!canAddItems.value) return;
  if (!newUnit.value.label || !newUnit.value.makeModel || !newUnit.value.serialNumber) {
    message.warning(
      isReviewOrUninstallation.value || isEquipmentReplacement.value
        ? 'Por favor selecciona un equipo instalado del cliente para autocompletar la unidad.'
        : 'Por favor completa los campos obligatorios de la unidad.',
    );
    return;
  }

  if (
    isReviewOrUninstallation.value &&
    (!unitModalEquipment.value || !unitModalEquipment.value.hasValidIdentity)
  ) {
    message.warning('Debes seleccionar un equipo válido instalado del cliente.');
    return;
  }

  if (isEquipmentReplacement.value) {
    if (!unitModalEquipment.value || !unitModalEquipment.value.hasValidIdentity) {
      message.warning('Debes seleccionar el equipo actualmente instalado con el cliente.');
      return;
    }
    if (!replacementNewEquipment.value || !replacementNewEquipment.value.hasValidIdentity) {
      message.warning('Debes seleccionar el equipo nuevo de reemplazo (sin instalar de almacén).');
      return;
    }
  }

  try {
    await mutations.insertUnit.mutateAsync({
      id: orderId,
      data: {
        label: newUnit.value.label.trim(),
        makeModel: newUnit.value.makeModel.trim(),
        serialNumber: newUnit.value.serialNumber.trim(),
        year: newUnit.value.year,
        serviceType: newUnit.value.serviceType,
        equipment: [unitModalEquipment.value, replacementNewEquipment.value]
          .filter((equipment): equipment is ExternalEquipment => Boolean(equipment))
          .map(toEquipmentAssignment),
      },
    });

    showAddUnitModal.value = false;
    unitModalEquipmentKey.value = null;
    unitModalEquipment.value = null;
    replacementNewEquipmentKey.value = null;
    replacementNewEquipment.value = null;
    newUnit.value = {
      label: '',
      makeModel: '',
      serialNumber: '',
      year: new Date().getFullYear(),
      serviceType: 'INSTALLATION',
    };
    message.success('Unidad agregada correctamente.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al agregar unidad'));
  }
}

async function handleDeleteUnit(unitId: string) {
  try {
    await mutations.removeUnit.mutateAsync({ id: orderId, unitId });
    message.success('Unidad eliminada.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al eliminar unidad'));
  }
}

function openAddEquipment(unitId: string) {
  if (!canAddItems.value) return;
  targetUnitId.value = unitId;
  selectedEquipmentKey.value = null;
  selectedEquipment.value = null;
  showAddEqModal.value = true;
}

function handleEquipmentSelect(eq: ExternalEquipment | null) {
  selectedEquipment.value = eq;
}

async function handleAddEquipment() {
  if (!canAddItems.value) return;
  if (!targetUnitId.value || !selectedEquipment.value || !selectedEquipmentKey.value) return;
  try {
    await mutations.attachEquipment.mutateAsync({
      id: orderId,
      unitId: targetUnitId.value,
      data: {
        externalKey: selectedEquipmentKey.value,
        externalId: selectedEquipment.value.id,
        imei: selectedEquipment.value.imei,
        sheetRowHint: selectedEquipment.value.rowNumber,
        brandSnapshot: selectedEquipment.value.brand,
        modelSnapshot: selectedEquipment.value.model,
        lineSnapshot: selectedEquipment.value.line,
        iccidSnapshot: selectedEquipment.value.iccid,
        carrierSnapshot: selectedEquipment.value.carrier,
        equipmentConditionSnapshot: selectedEquipment.value.condition,
        serviceStatusSnapshot: selectedEquipment.value.serviceStatus,
        rawSnapshot: selectedEquipment.value.rawValues,
      },
    });
    showAddEqModal.value = false;
    message.success('Equipo asignado correctamente.');
  } catch (err) {
    message.error(getErrorMessage(err, 'Error al asignar equipo'));
  }
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

async function handleRequestCorrection() {
  if (!correctionNotes.value.trim()) {
    message.warning('Por favor ingresa los motivos de la corrección.');
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

async function viewEvidence(evidenceId: string, categoryTitle: string) {
  try {
    const res = await getEvidenceUrl(evidenceId);
    releasePrivateFileUrl(previewImageUrl.value);
    previewImageUrl.value = res.downloadUrl;
    previewImageTitle.value = `Evidencia: ${categoryTitle}`;
    showImageModal.value = true;
  } catch (err) {
    message.error(getErrorMessage(err, 'No fue posible obtener la imagen de evidencia'));
  }
}

async function viewSignature() {
  try {
    const res = await getSignatureUrl(orderId);
    releasePrivateFileUrl(previewImageUrl.value);
    previewImageUrl.value = res.downloadUrl;
    previewImageTitle.value = `Firma de ${res.signerName || 'Receptor'}`;
    showImageModal.value = true;
  } catch (err) {
    message.error(getErrorMessage(err, 'No fue posible obtener la firma'));
  }
}

const evidenceUrls = ref<Record<string, string>>({});
const loadingEvidenceUrls = ref<Record<string, boolean>>({});
const signatureUrl = ref<string | null>(null);
const loadingSignature = ref(false);

onUnmounted(() => {
  releasePrivateFileUrl(previewImageUrl.value);
  releasePrivateFileUrl(signatureUrl.value);
  for (const url of Object.values(evidenceUrls.value)) releasePrivateFileUrl(url);
});

function getUnitAllEvidences(unit: UnitItem): Array<{ id: string; objectKey?: string }> {
  return unit.evidence?.filter((evidence) => evidence.status === 'COMPLETED' || !evidence.status) ?? [];
}

async function loadEvidenceUrl(evidenceId: string) {
  if (evidenceUrls.value[evidenceId] || loadingEvidenceUrls.value[evidenceId]) return;
  loadingEvidenceUrls.value[evidenceId] = true;
  try {
    const res = await getEvidenceUrl(evidenceId);
    evidenceUrls.value[evidenceId] = res.downloadUrl;
  } catch {
    // Ignore error
  } finally {
    loadingEvidenceUrls.value[evidenceId] = false;
  }
}

async function loadSignatureUrl() {
  if (!orderId || signatureUrl.value || loadingSignature.value) return;
  loadingSignature.value = true;
  try {
    const res = await getSignatureUrl(orderId);
    signatureUrl.value = res.downloadUrl;
  } catch {
    // Ignore error
  } finally {
    loadingSignature.value = false;
  }
}

function preloadEvidencesAndSignature() {
  if (!order.value) return;
  if (order.value.signature) {
    void loadSignatureUrl();
  }
  const units = order.value.units || [];
  for (const unit of units) {
    const evs = getUnitAllEvidences(unit);
    for (const ev of evs) {
      void loadEvidenceUrl(ev.id);
    }
  }
}

watch(
  () => [activeTab.value, order.value],
  () => {
    if (activeTab.value === 'evidence') {
      preloadEvidencesAndSignature();
    }
  },
  { immediate: true, deep: true },
);

const statusColor = orderStatusTagType;
</script>

<template>
  <app-layout>
    <div class="space-y-6">
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
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

        <!-- Service order PDF report -->
        <n-card
          v-if="order.status === 'COMPLETED'"
          class="border-l-4 border-l-blue-600 shadow-sm"
          size="small"
        >
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

            <div class="flex gap-2">
              <n-button
                v-if="report?.status === 'READY'"
                type="primary"
                size="small"
                @click="() => handleDownloadReport()"
              >
                Descargar PDF
              </n-button>
              <n-button
                v-if="(!report || report.status === 'FAILED') && session.user?.role === 'ADMIN'"
                type="warning"
                size="small"
                :loading="mutations.requestReport.isPending.value"
                @click="handleGenerateReport"
              >
                {{ report?.status === 'FAILED' ? 'Reintentar' : 'Generar reporte' }}
              </n-button>
              <n-button
                v-if="report?.status === 'PENDING' || report?.status === 'PROCESSING'"
                size="small"
                secondary
                @click="() => reportQuery.refetch()"
              >
                Actualizar
              </n-button>
            </div>
          </div>
          <div
            v-if="driveMode && reportVersions.length > 1"
            class="mt-3 border-t border-slate-100 pt-3"
          >
            <p class="text-xs font-semibold text-slate-600 mb-2">Versiones anteriores</p>
            <div class="flex flex-wrap gap-2">
              <n-button
                v-for="previous in reportVersions.filter(
                  (item) => item.status === 'READY' && item.version !== report?.version,
                )"
                :key="previous.id"
                size="tiny"
                secondary
                @click="() => handleDownloadReport(previous.version)"
              >
                Descargar versión {{ previous.version }}
              </n-button>
            </div>
          </div>
        </n-card>

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
              <strong class="text-slate-700">Desglose de Liquidación Técnica:</strong>
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
          </div>
          <div
            v-if="order.generalNotes"
            class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600"
          >
            <strong>Notas generales:</strong> {{ order.generalNotes }}
          </div>
        </n-card>

        <!-- Tabs Section -->
        <n-tabs v-model:value="activeTab" type="line" animated>
          <!-- Tab 1: Unidades y Equipos -->
          <n-tab-pane name="units" tab="Unidades y Equipos">
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="text-base font-bold text-slate-800">
                  Unidades Registradas ({{ order.units?.length || 0 }})
                </h2>

                <n-button
                  v-if="canAddItems"
                  size="small"
                  type="primary"
                  secondary
                  @click="openAddUnitModal"
                >
                  + Agregar Unidad
                </n-button>
              </div>

              <div
                v-if="order.units?.length === 0"
                class="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300"
              >
                <p class="text-sm text-slate-500">No hay unidades registradas en esta orden.</p>
                <n-button
                  v-if="canAddItems"
                  size="small"
                  type="primary"
                  class="mt-3"
                  @click="openAddUnitModal"
                >
                  Registrar Primera Unidad
                </n-button>
              </div>

              <div v-for="unit in order.units" :key="unit.id" class="space-y-2">
                <n-card class="shadow-sm" size="small">
                  <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-bold text-base text-slate-800">{{ unit.label }}</span>
                        <n-tag size="small" :type="unitStatusTagType(unit.status)">
                          {{ formatUnitStatus(unit.status) }}
                        </n-tag>
                        <n-tag size="small" type="info" secondary round>
                          {{ formatServiceType(unit.serviceType ?? order.serviceType) }}
                        </n-tag>
                      </div>
                      <p class="text-xs text-slate-500 mt-1">
                        {{ unit.makeModel }} {{ unit.year ? `(${unit.year})` : '' }} &bull; Serie /
                        VIN:
                        <span class="font-mono font-medium text-slate-700">{{
                          unit.serialNumber
                        }}</span>
                      </p>
                    </div>

                    <div
                      v-if="order.status === 'DRAFT' && session.user?.role === 'ADMIN'"
                      class="flex items-center gap-2 shrink-0 self-start sm:self-auto"
                    >
                      <n-button
                        v-if="canAddItems"
                        size="tiny"
                        type="primary"
                        secondary
                        @click="openAddEquipment(unit.id)"
                      >
                        + Asignar Equipo
                      </n-button>
                      <n-popconfirm @positive-click="handleDeleteUnit(unit.id)">
                        <template #trigger>
                          <n-button size="tiny" type="error" secondary>Eliminar</n-button>
                        </template>
                        ¿Eliminar esta unidad y sus equipos asignados?
                      </n-popconfirm>
                    </div>
                  </div>

                  <!-- Equipment in Unit -->
                  <div class="mt-4 pt-3 border-t border-slate-100">
                    <span class="text-xs font-semibold text-slate-600 block mb-2">
                      Equipos de Google Sheets asignados ({{ unit.equipment?.length || 0 }}):
                    </span>

                    <div v-if="unit.equipment?.length === 0" class="text-xs text-slate-400 italic">
                      Sin equipos asignados a esta unidad.
                    </div>

                    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div
                        v-for="eq in unit.equipment"
                        :key="eq.id"
                        class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs"
                      >
                        <div>
                          <span class="font-bold text-slate-800"
                            >{{ eq.brandSnapshot }} {{ eq.modelSnapshot }}</span
                          >
                          <span class="block text-slate-500 font-mono text-[11px] mt-0.5">
                            ID: {{ eq.externalId || 'N/A' }} &bull; IMEI: {{ eq.imei || 'N/A' }}
                          </span>
                          <span class="text-slate-500 block text-[11px]">
                            Condición: {{ eq.equipmentConditionSnapshot || 'N/A' }}
                            <span
                              v-if="eq.verificationStatus"
                              class="ml-2 font-semibold text-indigo-600"
                            >
                              [{{ formatEquipmentStatus(eq.verificationStatus) }}]
                            </span>
                          </span>
                        </div>

                        <n-button
                          v-if="order.status === 'DRAFT' && session.user?.role === 'ADMIN'"
                          size="tiny"
                          type="error"
                          quaternary
                          @click="handleRemoveEquipment(unit.id, eq.id)"
                        >
                          Quitar
                        </n-button>
                      </div>
                    </div>
                  </div>
                </n-card>
              </div>
            </div>
          </n-tab-pane>

          <!-- Tab 2: Evidencias y Firma -->
          <n-tab-pane name="evidence" tab="Evidencias y Firma">
            <div class="space-y-6">
              <!-- Signature Section -->
              <n-card class="shadow-sm" title="Firma de Conformidad" size="small">
                <div
                  v-if="order.signature"
                  class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div class="space-y-1">
                    <p class="text-sm font-semibold text-slate-800">
                      Firmado por:
                      {{ order.signature.signerName }}
                    </p>
                    <p class="text-xs text-slate-500">
                      Fecha de firma:
                      {{ new Date(order.signature.signedAt).toLocaleString() }}
                    </p>
                  </div>
                  <div class="flex items-center gap-3">
                    <div
                      v-if="signatureUrl"
                      class="w-32 h-14 bg-slate-50 rounded border border-slate-200 p-1 flex items-center justify-center"
                    >
                      <n-image
                        :src="signatureUrl"
                        alt="Firma Digital"
                        class="max-h-full max-w-full object-contain"
                        :img-props="{ class: 'max-h-12 max-w-full object-contain' }"
                      />
                    </div>
                    <n-button size="small" type="primary" secondary @click="viewSignature">
                      Ver Firma Digital
                    </n-button>
                  </div>
                </div>
                <n-empty v-else description="No se ha registrado firma en esta orden." />
              </n-card>

              <!-- Units & Evidence Section -->
              <div class="space-y-4">
                <h3 class="text-base font-bold text-slate-800">
                  Checklist y Evidencias por Unidad
                </h3>

                <div v-for="unit in order.units ?? []" :key="unit.id" class="space-y-2">
                  <n-card class="shadow-sm" size="small">
                    <div class="space-y-4">
                      <!-- Unit Header -->
                      <div
                        class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3"
                      >
                        <div>
                          <h4 class="font-bold text-slate-800 text-sm">
                            Unidad: {{ unit.label }}
                            <span class="font-normal text-slate-500">({{ unit.makeModel }})</span>
                          </h4>
                          <p v-if="unit.serialNumber" class="text-xs text-slate-400 mt-0.5">
                            N° Serie / VIN: {{ unit.serialNumber }}
                          </p>
                        </div>

                        <div class="flex items-center gap-2">
                          <n-tag
                            size="small"
                            :type="
                              getUnitAllEvidences(unit).length >= MIN_REQUIRED_EVIDENCE_PHOTOS
                                ? 'success'
                                : 'warning'
                            "
                            round
                          >
                            {{ getUnitAllEvidences(unit).length }} fotos registradas
                          </n-tag>
                        </div>
                      </div>

                      <!-- 1. Checklist Table / Grid -->
                      <div>
                        <h5
                          class="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5"
                        >
                          <span>Checklist de Recepción del Vehículo</span>
                        </h5>

                        <div
                          v-if="!unit.checklist?.items || unit.checklist.items.length === 0"
                          class="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-200"
                        >
                          Checklist no iniciado o sin elementos.
                        </div>

                        <div
                          v-else
                          class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5"
                        >
                          <div
                            v-for="item in unit.checklist.items"
                            :key="item.id"
                            class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 flex flex-col justify-between"
                          >
                            <div>
                              <div class="flex items-start justify-between gap-1 mb-1">
                                <span class="font-semibold text-slate-800 leading-tight">
                                  {{ CATEGORY_NAMES[item.category] || item.category }}
                                </span>
                                <n-tag
                                  size="tiny"
                                  :type="
                                    item.condition === 'GOOD'
                                      ? 'success'
                                      : item.condition === 'BAD'
                                        ? 'error'
                                        : 'default'
                                  "
                                >
                                  {{
                                    item.condition === 'GOOD'
                                      ? 'Bien'
                                      : item.condition === 'BAD'
                                        ? 'Mal'
                                        : 'No aplica'
                                  }}
                                </n-tag>
                              </div>

                              <div
                                v-if="item.notes"
                                class="text-red-700 bg-red-50 p-1.5 rounded border border-red-100 text-[11px] leading-snug"
                              >
                                <span class="font-bold">Nota:</span> {{ item.notes }}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- 2. Unit Evidence Gallery below Checklist -->
                      <div class="pt-3 border-t border-slate-100">
                        <div class="flex items-center justify-between mb-2.5">
                          <h5
                            class="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5"
                          >
                            <span>Galería de Evidencias Fotográficas</span>
                            <span class="text-slate-400 font-normal"
                              >({{ getUnitAllEvidences(unit).length }})</span
                            >
                          </h5>
                        </div>

                        <div
                          v-if="getUnitAllEvidences(unit).length === 0"
                          class="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-dashed border-slate-200 text-center"
                        >
                          No se adjuntaron fotografías para esta unidad.
                        </div>

                        <div
                          v-else
                          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
                        >
                          <div
                            v-for="(ev, idx) in getUnitAllEvidences(unit)"
                            :key="ev.id"
                            class="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs hover:shadow-md transition-shadow group flex flex-col"
                          >
                            <div
                              class="w-full h-28 flex items-center justify-center bg-slate-900/5 relative overflow-hidden"
                            >
                              <template v-if="evidenceUrls[ev.id]">
                                <n-image
                                  :src="evidenceUrls[ev.id]!"
                                  :alt="`Evidencia #${idx + 1}`"
                                  object-fit="cover"
                                  class="w-full h-full flex items-center justify-center cursor-pointer"
                                  :img-props="{ class: 'w-full h-28 object-cover rounded' }"
                                />
                              </template>
                              <template v-else-if="loadingEvidenceUrls[ev.id]">
                                <div class="flex flex-col items-center gap-1 text-slate-400">
                                  <n-spin size="small" />
                                  <span class="text-[10px]">Cargando...</span>
                                </div>
                              </template>
                              <template v-else>
                                <n-button
                                  size="tiny"
                                  secondary
                                  @click="
                                    viewEvidence(ev.id, `${unit.label} - Foto #${Number(idx) + 1}`)
                                  "
                                >
                                  Ver foto {{ Number(idx) + 1 }}
                                </n-button>
                              </template>

                              <!-- Badge index -->
                              <div
                                class="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none"
                              >
                                #{{ Number(idx) + 1 }}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </n-card>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <!-- Tab 3: Auditoría -->
          <n-tab-pane name="audit" tab="Registro de Auditoría">
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-800">Historial de Eventos de la Orden</h3>
                <n-button size="small" secondary @click="() => auditQuery.refetch()">
                  Actualizar Registro
                </n-button>
              </div>

              <div v-if="auditQuery.isPending.value" class="grid min-h-32 place-items-center">
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
                    <p
                      v-if="log.payload"
                      class="text-slate-500 font-mono text-[11px] mt-1 line-clamp-2"
                    >
                      {{ JSON.stringify(log.payload) }}
                    </p>
                  </div>

                  <span class="text-slate-400 font-mono text-[11px] whitespace-nowrap">
                    {{ new Date(log.createdAt).toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <!-- Tab 4: Sincronización con Sheets -->
          <n-tab-pane name="sync" tab="Sincronización Sheets">
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
                      {{
                        syncInfo.isFullySynced
                          ? 'Completamente sincronizada'
                          : 'Pendiente / en proceso'
                      }}
                      &bull; Operaciones: {{ syncInfo.synced }} / {{ syncInfo.total }}
                      <span v-if="syncInfo.failed > 0" class="text-red-600 font-bold ml-1">
                        ({{ syncInfo.failed }} fallidas)
                      </span>
                    </p>
                  </div>

                  <n-button
                    v-if="syncInfo.failed > 0 && session.user?.role === 'ADMIN'"
                    size="small"
                    type="warning"
                    :loading="mutations.retry.isPending.value"
                    @click="handleRetrySync"
                  >
                    Reintentar Operaciones
                  </n-button>
                </div>
              </n-card>

              <div class="flex items-center justify-between">
                <h3 class="text-base font-bold text-slate-800">Operaciones de Sincronización</h3>
                <n-button
                  v-if="session.user?.role === 'ADMIN' && (syncInfo?.failed ?? 0) > 0"
                  size="small"
                  type="primary"
                  secondary
                  :loading="mutations.retry.isPending.value"
                  @click="handleRetrySync"
                >
                  Reintentar fallidas
                </n-button>
              </div>

              <div v-if="syncQuery.isPending.value" class="grid min-h-32 place-items-center">
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
                          op.status === 'SYNCED'
                            ? 'success'
                            : op.status === 'FAILED'
                              ? 'error'
                              : 'warning'
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

              <n-empty
                v-else
                description="No existen operaciones de sincronización para esta orden."
              />
            </div>
          </n-tab-pane>
        </n-tabs>
      </template>

      <!-- Modal: Add Unit -->
      <n-modal
        v-model:show="showAddUnitModal"
        preset="card"
        title="Agregar Unidad a la Orden"
        class="w-[92vw] max-w-lg"
      >
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Tipo de Servicio</label>
            <n-select
              v-model:value="newUnit.serviceType"
              :options="serviceTypeOptions"
              placeholder="Seleccionar tipo de servicio"
            />
          </div>

          <!-- Case A: Equipment Replacement -->
          <div v-if="isEquipmentReplacement" class="space-y-4 pt-2 border-t border-slate-100">
            <div
              class="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1"
            >
              <p class="font-semibold">Cambio de Equipo</p>
              <p>
                1. Selecciona el <strong>equipo actualmente instalado</strong> con el cliente (los
                datos del vehículo se vinculan automáticamente sin capturarlos).<br />
                2. Selecciona el <strong>equipo nuevo de almacén</strong> (sin instalar).
              </p>
            </div>

            <!-- 1. Equipo instalado con el cliente -->
            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-700">
                1. Equipo Actualmente Instalado (a retirar / cliente:
                {{ order?.clientNameSnapshot }}):
              </label>
              <equipment-select
                v-model="unitModalEquipmentKey"
                service-type="UNINSTALLATION"
                :client-name="order?.clientNameSnapshot"
                :exclude-keys="excludeKeysForModalReplacementOld"
                @select="handleUnitModalEquipmentSelect"
              />

              <div
                v-if="unitModalEquipment"
                class="p-3 bg-slate-50 rounded border text-xs space-y-1"
              >
                <p>
                  <strong>Equipo actual:</strong> {{ unitModalEquipment.brand }}
                  {{ unitModalEquipment.model }} | <strong>IMEI:</strong>
                  {{ unitModalEquipment.imei || 'N/A' }}
                </p>
                <p class="text-indigo-700 font-medium">
                  <strong>Vehículo vinculado en Sheets:</strong>
                  {{ unitModalEquipment.unit || 'Sin registrar' }}
                  ({{ unitModalEquipment.unitMakeModel || 'Sin modelo' }}
                  {{ unitModalEquipment.unitYear || '' }}) | <strong>Serie:</strong>
                  {{ unitModalEquipment.unitSerialNumber || 'Sin serie' }}
                </p>
              </div>
            </div>

            <!-- 2. Equipo nuevo de almacén -->
            <div class="space-y-2 pt-2 border-t border-slate-200">
              <label class="block text-xs font-bold text-slate-700">
                2. Equipo de Reemplazo (nuevo / sin instalar de almacén):
              </label>
              <equipment-select
                v-model="replacementNewEquipmentKey"
                service-type="INSTALLATION"
                :client-name="order?.clientNameSnapshot"
                :exclude-keys="excludeKeysForModalReplacementNew"
                @select="handleReplacementNewSelect"
              />

              <div
                v-if="replacementNewEquipment"
                class="p-3 bg-slate-50 rounded border text-xs space-y-1"
              >
                <p>
                  <strong>Equipo a colocar:</strong> {{ replacementNewEquipment.brand }}
                  {{ replacementNewEquipment.model }} | <strong>IMEI:</strong>
                  {{ replacementNewEquipment.imei || 'N/A' }}
                </p>
                <p class="text-slate-500">
                  Estado: {{ replacementNewEquipment.condition || 'N/A' }} &bull; Servicio:
                  {{ replacementNewEquipment.serviceStatus || 'DISPONIBLE' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Case B: Review or Uninstallation (Select from client's installed equipment) -->
          <div
            v-else-if="isReviewOrUninstallation"
            class="space-y-3 pt-2 border-t border-slate-100"
          >
            <div class="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              <p class="font-semibold mb-0.5">
                {{
                  newUnit.serviceType === 'REVIEW'
                    ? 'Revisión de Equipos'
                    : 'Desinstalación de Equipos'
                }}
              </p>
              <p>
                Selecciona el equipo actualmente instalado para
                <strong>{{ order?.clientNameSnapshot }}</strong
                >. Los datos de la unidad se autocompletarán desde Google Sheets.
              </p>
            </div>

            <equipment-select
              v-model="unitModalEquipmentKey"
              :service-type="newUnit.serviceType"
              :client-name="order?.clientNameSnapshot"
              :exclude-keys="assignedEquipmentKeys"
              @select="handleUnitModalEquipmentSelect"
            />

            <div v-if="unitModalEquipment" class="p-3 bg-slate-50 rounded border text-xs space-y-1">
              <p>
                <strong>Equipo:</strong> {{ unitModalEquipment.brand }}
                {{ unitModalEquipment.model }} | <strong>IMEI:</strong>
                {{ unitModalEquipment.imei || 'N/A' }}
              </p>
              <p>
                <strong>Unidad en Sheets:</strong>
                {{ unitModalEquipment.unit || 'Sin registrar' }} ({{
                  unitModalEquipment.unitMakeModel || 'Sin modelo'
                }}
                {{ unitModalEquipment.unitYear || '' }}) | <strong>Serie:</strong>
                {{ unitModalEquipment.unitSerialNumber || 'Sin serie' }}
              </p>
            </div>

            <div v-if="unitModalEquipment" class="space-y-3 pt-2 border-t border-slate-200">
              <span class="text-xs font-semibold text-slate-700 block"
                >Datos de la unidad (verificados / editables):</span
              >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1"
                    >Etiqueta / Económico *</label
                  >
                  <n-input v-model:value="newUnit.label" placeholder="Ej: Camión 01" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1"
                    >Marca y Modelo *</label
                  >
                  <n-input v-model:value="newUnit.makeModel" placeholder="Ej: Kenworth T680" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
                  <n-input-number
                    v-model:value="newUnit.year"
                    :min="1980"
                    :max="2030"
                    class="w-full"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1"
                    >Número de Serie / VIN *</label
                  >
                  <n-input v-model:value="newUnit.serialNumber" placeholder="Número de serie..." />
                </div>
              </div>
            </div>
          </div>

          <!-- Case C: Installation / Fuel Sensor / Other services -->
          <div v-else class="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1"
                >Identificador / Etiqueta *</label
              >
              <n-input
                v-model:value="newUnit.label"
                placeholder="Ej: Camión 01, T-12, Unidad Norte..."
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Marca y Modelo *</label>
              <n-input
                v-model:value="newUnit.makeModel"
                placeholder="Ej: Kenworth T680, Ford F-150..."
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1"
                >Número de Serie / VIN *</label
              >
              <n-input
                v-model:value="newUnit.serialNumber"
                placeholder="Número de serie único de la unidad..."
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
              <n-input-number v-model:value="newUnit.year" :min="1980" :max="2030" class="w-full" />
            </div>

            <!-- Optional Equipment from Stock -->
            <div class="pt-2 border-t border-slate-100">
              <label class="block text-xs font-medium text-slate-600 mb-1">
                Equipo de Almacén (Opcional)
              </label>
              <p class="text-[11px] text-slate-400 mb-2">
                Puedes seleccionar un equipo ahora o asignarlo más tarde desde la orden.
              </p>
              <equipment-select
                v-model="unitModalEquipmentKey"
                :service-type="newUnit.serviceType"
                :client-name="order?.clientNameSnapshot"
                :exclude-keys="assignedEquipmentKeys"
                @select="handleUnitModalEquipmentSelect"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <n-button @click="showAddUnitModal = false">Cancelar</n-button>
            <n-button
              type="primary"
              :disabled="
                isEquipmentReplacement
                  ? !unitModalEquipment ||
                    !unitModalEquipment.hasValidIdentity ||
                    !replacementNewEquipment ||
                    !replacementNewEquipment.hasValidIdentity
                  : isReviewOrUninstallation
                    ? !unitModalEquipment ||
                      !unitModalEquipment.hasValidIdentity ||
                      !newUnit.label.trim() ||
                      !newUnit.serialNumber.trim()
                    : !newUnit.label.trim() ||
                      !newUnit.makeModel.trim() ||
                      !newUnit.serialNumber.trim() ||
                      Boolean(
                        unitModalEquipmentKey &&
                        (!unitModalEquipment || !unitModalEquipment.hasValidIdentity),
                      )
              "
              :loading="mutations.insertUnit.isPending.value"
              @click="handleAddUnit"
            >
              Guardar Unidad
            </n-button>
          </div>
        </div>
      </n-modal>

      <!-- Modal: Add Equipment -->
      <n-modal
        v-model:show="showAddEqModal"
        preset="card"
        title="Asignar Equipo desde Google Sheets"
        class="w-[92vw] max-w-lg"
      >
        <div class="space-y-4">
          <equipment-select
            v-model="selectedEquipmentKey"
            :service-type="targetUnit?.serviceType ?? order?.serviceType"
            :client-name="order?.clientNameSnapshot"
            :exclude-keys="assignedEquipmentKeys"
            @select="handleEquipmentSelect"
          />

          <div v-if="selectedEquipment" class="p-3 bg-slate-50 rounded text-xs space-y-1">
            <p>
              <strong>Marca:</strong> {{ selectedEquipment.brand }} | <strong>Modelo:</strong>
              {{ selectedEquipment.model }}
            </p>
            <p>
              <strong>Línea:</strong> {{ selectedEquipment.line || 'N/A' }} |
              <strong>Compañía:</strong> {{ selectedEquipment.carrier || 'N/A' }}
            </p>
            <p>
              <strong>Estado:</strong> {{ selectedEquipment.condition || 'N/A' }} |
              <strong>Servicio:</strong> {{ selectedEquipment.serviceStatus || 'N/A' }}
            </p>
            <p v-if="selectedEquipment.currentClient || selectedEquipment.unit">
              <strong>Cliente actual:</strong> {{ selectedEquipment.currentClient || 'N/A' }} |
              <strong>Unidad:</strong> {{ selectedEquipment.unit || 'N/A' }}
            </p>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <n-button @click="showAddEqModal = false">Cancelar</n-button>
            <n-button
              type="primary"
              :disabled="!selectedEquipmentKey || !selectedEquipment?.hasValidIdentity"
              :loading="mutations.attachEquipment.isPending.value"
              @click="handleAddEquipment"
            >
              Asignar a la Unidad
            </n-button>
          </div>
        </div>
      </n-modal>

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
    </div>
  </app-layout>
</template>
