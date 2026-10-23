<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NTag,
  NRadioGroup,
  NRadio,
  NInput,
  NModal,
  NAlert,
  NSelect,
  NSpin,
  NTabs,
  NTabPane,
  useMessage,
} from 'naive-ui';
import {
  MAX_DISCREPANCY_DESCRIPTION_LENGTH,
  MAX_ORDER_NOTES_LENGTH,
  MIN_REQUIRED_EVIDENCE_PHOTOS,
  type OrderExecutionDetail,
} from '@puk/contracts';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import { useSessionStore } from '../../../stores/session.js';
import {
  fetchOrderExecutionById,
  formatEquipmentStatus,
  formatOrderStatus,
  formatServiceType,
} from '../../orders/index.js';
import {
  checkCompleteness,
  completeOrder,
  failAppointment,
  reportDiscrepancy,
  requireCorrection,
  saveChecklist,
  startOrder,
  uploadSignatureFile,
  verifyEquipment,
} from '../api.js';
import EvidenceCapture from '../components/EvidenceCapture.vue';
import SignaturePad from '../components/SignaturePad.vue';
import { CATEGORIES, CATEGORY_NAMES, useUnitChecklists } from '../composables/useUnitChecklists.js';
import { useExecutionNotes } from '../composables/useExecutionNotes.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const message = useMessage();

const orderId = String(route.params.id);
const order = ref<OrderExecutionDetail | null>(null);
const completeness = ref<{ isComplete: boolean; missingRequirements: string[] } | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const { executionNotes, executionNotesDirty, savingExecutionNotes, saveExecutionNotes } =
  useExecutionNotes(orderId);

const serviceTypes = computed(() => {
  if (!order.value) return [];
  return [...new Set(order.value.units.map((unit) => unit.serviceType))];
});

// Discrepancy modal
const showDiscrepancyModal = ref(false);
const discrepancyTarget = ref<{ unitId: string; equipmentId: string } | null>(null);
const discrepancyType = ref<'IMEI' | 'ID' | 'SERIAL' | 'UNIT' | 'OTHER'>('IMEI');
const discrepancyDesc = ref('');

// Failed appointment modal
const showFailedModal = ref(false);
const failedReason = ref('');

// Correction modal
const showCorrectionModal = ref(false);
const correctionNotes = ref('');

// Active unit tab
const activeUnitTab = ref<string>('');

const {
  createSaveChecklistItems,
  getUnitItem,
  initChecklistForUnit,
  isUnitChecklistDirty,
  markUnitChecklistSaved,
} = useUnitChecklists();

function getUnitAllEvidences(unitId: string) {
  const unit = order.value?.units?.find((u) => u.id === unitId);
  return unit?.evidence?.filter((evidence) => evidence.status === 'COMPLETED') ?? [];
}

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [orderData, compData] = await Promise.all([
      fetchOrderExecutionById(orderId),
      checkCompleteness(orderId).catch(() => null),
    ]);
    order.value = orderData;
    completeness.value = compData;
    if (!executionNotesDirty.value) {
      executionNotes.value = orderData.generalNotes ?? '';
    }

    if (orderData.units && orderData.units.length > 0) {
      if (!activeUnitTab.value) {
        activeUnitTab.value = orderData.units[0]?.id ?? '';
      }
      for (const unit of orderData.units) {
        initChecklistForUnit(unit.id, unit.checklist?.items);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar orden';
    error.value = message;
  } finally {
    loading.value = false;
  }
}

async function handleStartOrder() {
  try {
    await startOrder(orderId);
    message.success('Orden de servicio iniciada.');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al iniciar la orden'));
  }
}

async function handleVerifyEquipment(unitId: string, equipmentId: string) {
  try {
    await verifyEquipment(orderId, unitId, equipmentId);
    message.success('Equipo verificado como coincidente.');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al verificar equipo'));
  }
}

function openDiscrepancyModal(unitId: string, equipmentId: string) {
  discrepancyTarget.value = { unitId, equipmentId };
  discrepancyType.value = 'IMEI';
  discrepancyDesc.value = '';
  showDiscrepancyModal.value = true;
}

async function handleSaveDiscrepancy() {
  if (!discrepancyTarget.value || !discrepancyDesc.value.trim()) return;
  if (discrepancyDesc.value.trim().length > MAX_DISCREPANCY_DESCRIPTION_LENGTH) {
    message.error(
      `La descripción no puede superar ${MAX_DISCREPANCY_DESCRIPTION_LENGTH.toLocaleString('es-MX')} caracteres.`,
    );
    return;
  }
  try {
    await reportDiscrepancy(
      orderId,
      discrepancyTarget.value.unitId,
      discrepancyTarget.value.equipmentId,
      {
        type: discrepancyType.value,
        description: discrepancyDesc.value.trim(),
      },
    );
    showDiscrepancyModal.value = false;
    message.warning('Discrepancia reportada correctamente.');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al reportar discrepancia'));
  }
}

async function handleSaveUnitChecklist(unitId: string) {
  const result = createSaveChecklistItems(unitId);
  if (!result) return;
  if (!result.ok) {
    message.error(result.message);
    return;
  }

  try {
    await saveChecklist(orderId, unitId, result.items);
    markUnitChecklistSaved(unitId);
    message.success('Checklist guardado exitosamente');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al guardar checklist'));
  }
}

const savingSignature = ref(false);

async function handleSaveSignature(payload: { signerName: string; blob: Blob }) {
  savingSignature.value = true;
  try {
    await uploadSignatureFile(orderId, payload.signerName, payload.blob);

    message.success('Firma guardada exitosamente');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al guardar firma'));
  } finally {
    savingSignature.value = false;
  }
}

async function handleCompleteOrder() {
  if (order.value?.units) {
    for (const unit of order.value.units) {
      if (isUnitChecklistDirty(unit.id)) {
        const result = createSaveChecklistItems(unit.id);
        if (!result) continue;
        if (!result.ok) {
          activeUnitTab.value = unit.id;
          message.error(result.message);
          return;
        }
        try {
          await saveChecklist(orderId, unit.id, result.items);
          markUnitChecklistSaved(unit.id);
        } catch (err: unknown) {
          message.error(extractApiErrorMessage(err, 'Error al guardar checklist'));
          return;
        }
      }
    }
  }

  if (executionNotesDirty.value) {
    try {
      await saveExecutionNotes();
    } catch (err: unknown) {
      message.error(extractApiErrorMessage(err, 'Error al guardar las notas de ejecución'));
      return;
    }
  }

  try {
    const res = await completeOrder(orderId);
    const warnings = res.warnings ?? [];
    if (warnings.length > 0) {
      for (const w of warnings) {
        message.warning(w, { duration: 10000, closable: true });
      }
    }
    message.success('¡Orden de servicio finalizada y cerrada con éxito!');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al completar orden'));
  }
}

async function handleSaveExecutionNotes() {
  try {
    await saveExecutionNotes(async () => {
      message.success('Notas de ejecución guardadas');
      await loadData();
    });
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al guardar las notas de ejecución'));
  }
}

async function handleFailAppointment() {
  if (!failedReason.value.trim()) return;
  try {
    await failAppointment(orderId, { failedReason: failedReason.value.trim() });
    showFailedModal.value = false;
    message.warning('Orden marcada como cita fallida.');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al marcar cita fallida'));
  }
}

async function handleRequireCorrection() {
  if (!correctionNotes.value.trim()) return;
  if (correctionNotes.value.length > MAX_ORDER_NOTES_LENGTH) {
    message.error(
      `Las notas no pueden superar ${MAX_ORDER_NOTES_LENGTH.toLocaleString('es-MX')} caracteres.`,
    );
    return;
  }
  try {
    await requireCorrection(orderId, { notes: correctionNotes.value.trim() });
    showCorrectionModal.value = false;
    message.info('Orden devuelta a corrección técnica.');
    await loadData();
  } catch (err: unknown) {
    message.error(extractApiErrorMessage(err, 'Error al solicitar corrección'));
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <app-layout>
    <div
      data-tour-page="execution"
      :data-tour-ready="!!order && !loading"
      :data-tour-error="!!error"
      :data-tour-status="order?.status"
      :data-tour-unit="activeUnitTab"
      class="max-w-4xl mx-auto space-y-6 pb-12"
    >
      <!-- Header -->
      <div
        data-tour="execution-status"
        class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
      >
        <div>
          <div class="flex items-center gap-2">
            <NButton secondary size="small" @click="router.push('/orders')">← Volver</NButton>
            <h1 class="text-xl font-bold text-slate-800">
              Trabajo Técnico: <span class="font-mono text-indigo-600">{{ order?.folio }}</span>
            </h1>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Cliente: <span class="font-bold">{{ order?.clientNameSnapshot }}</span>
            <template v-if="order">
              • {{ order.units.length }} {{ order.units.length === 1 ? 'unidad' : 'unidades' }}
            </template>
          </p>
          <div v-if="order" class="flex flex-wrap items-center gap-1.5 mt-2">
            <span class="text-xs font-medium text-slate-500">Servicios en la orden:</span>
            <NTag
              v-for="serviceType in serviceTypes"
              :key="serviceType"
              size="small"
              type="info"
              :bordered="false"
            >
              {{ formatServiceType(serviceType) }}
            </NTag>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <NTag
            v-if="order"
            size="medium"
            :type="
              order.status === 'COMPLETED'
                ? 'success'
                : order.status === 'IN_PROGRESS'
                  ? 'warning'
                  : 'info'
            "
          >
            {{ formatOrderStatus(order.status) }}
          </NTag>

          <NButton
            v-if="order?.status === 'ASSIGNED'"
            type="primary"
            class="w-full sm:w-auto"
            @click="handleStartOrder"
          >
            Iniciar Trabajo
          </NButton>
        </div>
      </div>

      <NAlert v-if="error" type="error" closable class="mb-4">
        {{ error }}
      </NAlert>

      <NSpin :show="loading">
        <div v-if="order" class="space-y-6">
          <!-- Units Execution Stepper / Tabs -->
          <NCard data-tour="execution-units" title="Trabajo por unidad" class="shadow-sm">
            <p class="text-xs text-slate-500 mb-3">
              Selecciona una unidad. El tipo de servicio indicado corresponde exclusivamente a esa
              unidad.
            </p>
            <div v-if="order.units.length > 1" class="mb-3 sm:hidden">
              <label class="mb-1 block text-xs font-semibold text-slate-600">
                Cambiar unidad ({{ order.units.length }} disponibles)
              </label>
              <NSelect
                v-model:value="activeUnitTab"
                size="small"
                :options="
                  order.units.map((u, idx) => ({
                    label: `#${idx + 1} ${u.label} · ${formatServiceType(u.serviceType)}`,
                    value: u.id,
                  }))
                "
                :input-props="{ 'aria-label': 'Seleccionar unidad' }"
              />
            </div>
            <NTabs v-model:value="activeUnitTab" type="line" animated>
              <NTabPane v-for="unit in order.units" :key="unit.id" :name="unit.id">
                <template #tab>
                  <span class="inline-flex items-center gap-2">
                    <span>{{ unit.label }}</span>
                    <NTag size="small" type="info" :bordered="false" class="hidden sm:inline-flex">
                      {{ formatServiceType(unit.serviceType) }}
                    </NTag>
                  </span>
                </template>

                <div class="space-y-6 pt-2">
                  <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <span class="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          Servicio a realizar en esta unidad
                        </span>
                        <p class="text-lg font-bold text-slate-900 mt-0.5">
                          {{ formatServiceType(unit.serviceType) }}
                        </p>
                      </div>
                      <NTag type="info" size="medium">{{ unit.label }}</NTag>
                    </div>

                    <div
                      class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 pt-3 border-t border-indigo-100 text-xs text-slate-700"
                    >
                      <p>
                        <strong>Vehículo:</strong> {{ unit.makeModel }}
                        {{ unit.year ? `(${unit.year})` : '' }}
                      </p>
                      <p>
                        <strong>Serie / VIN:</strong>
                        <span class="font-mono">{{ unit.serialNumber }}</span>
                      </p>
                    </div>
                  </div>

                  <!-- Equipments Verification Section -->
                  <div data-tour="execution-equipment" class="space-y-3">
                    <h3 class="text-sm font-bold text-slate-800">
                      Verificación de Equipos Asignados
                    </h3>

                    <div
                      v-if="!unit.equipment || unit.equipment.length === 0"
                      class="text-xs text-slate-400 italic"
                    >
                      Sin equipos asignados a esta unidad.
                    </div>

                    <div
                      v-for="eq in unit.equipment"
                      :key="eq.id"
                      class="p-3 border rounded-lg space-y-2"
                      :class="
                        eq.verificationStatus === 'MATCHED'
                          ? 'border-green-300 bg-green-50/40'
                          : eq.verificationStatus === 'DISCREPANCY_REPORTED'
                            ? 'border-amber-300 bg-amber-50/40'
                            : 'border-slate-200 bg-white'
                      "
                    >
                      <div class="flex justify-between items-start">
                        <div class="text-xs">
                          <span class="font-bold text-slate-800 text-sm block">
                            {{ eq.brandSnapshot }} {{ eq.modelSnapshot }}
                          </span>
                          <span class="font-mono text-slate-600 block">
                            ID: {{ eq.externalId || 'N/A' }} | IMEI: {{ eq.imei || 'N/A' }}
                          </span>
                        </div>

                        <NTag
                          size="small"
                          :type="
                            eq.verificationStatus === 'MATCHED'
                              ? 'success'
                              : eq.verificationStatus === 'DISCREPANCY_REPORTED'
                                ? 'warning'
                                : 'default'
                          "
                        >
                          {{ formatEquipmentStatus(eq.verificationStatus) }}
                        </NTag>
                      </div>

                      <div v-if="order.status === 'IN_PROGRESS'" class="flex flex-wrap gap-2 pt-1">
                        <NButton
                          size="small"
                          type="success"
                          secondary
                          class="flex-1 sm:flex-initial"
                          @click="handleVerifyEquipment(unit.id, eq.id)"
                        >
                          Coincide Físicamente
                        </NButton>

                        <NButton
                          size="small"
                          type="warning"
                          secondary
                          class="flex-1 sm:flex-initial"
                          @click="openDiscrepancyModal(unit.id, eq.id)"
                        >
                          Reportar Discrepancia
                        </NButton>
                      </div>
                    </div>
                  </div>

                  <!-- Checklist Section -->
                  <div
                    data-tour="execution-checklist"
                    class="space-y-4 pt-4 border-t border-slate-200"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <h3 class="text-sm font-bold text-slate-800">
                        Checklist de Recepción del Vehículo
                      </h3>
                      <NTag v-if="isUnitChecklistDirty(unit.id)" size="small" type="warning" round>
                        Cambios sin guardar
                      </NTag>
                    </div>

                    <div
                      v-for="catKey in CATEGORIES"
                      :key="catKey"
                      class="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs"
                    >
                      <div
                        class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                      >
                        <span class="font-bold text-slate-800 text-sm">{{
                          CATEGORY_NAMES[catKey]
                        }}</span>

                        <NRadioGroup
                          v-model:value="getUnitItem(unit.id, catKey).condition"
                          name="condition"
                          size="small"
                        >
                          <NRadio value="GOOD">Bien</NRadio>
                          <NRadio value="BAD">Mal</NRadio>
                          <NRadio value="NOT_APPLICABLE">No aplica</NRadio>
                        </NRadioGroup>
                      </div>

                      <!-- Notes required on BAD -->
                      <div v-if="getUnitItem(unit.id, catKey).condition === 'BAD'" class="pt-1">
                        <label class="block text-xs font-semibold text-red-600 mb-1">
                          Observación obligatoria del daño / detalle *
                        </label>
                        <NInput
                          v-model:value="getUnitItem(unit.id, catKey).notes"
                          type="textarea"
                          rows="2"
                          placeholder="Describa el detalle observado..."
                        />
                      </div>
                    </div>

                    <div v-if="order.status === 'IN_PROGRESS'" class="flex justify-end pt-2">
                      <NButton
                        type="primary"
                        secondary
                        size="small"
                        @click="handleSaveUnitChecklist(unit.id)"
                      >
                        Guardar Checklist de Unidad
                      </NButton>
                    </div>

                    <!-- Evidence upload for unit -->
                    <div data-tour="execution-evidence" class="pt-4 border-t border-slate-200">
                      <EvidenceCapture
                        :order-id="orderId"
                        :unit-id="unit.id"
                        :evidences="getUnitAllEvidences(unit.id)"
                        :min-required="MIN_REQUIRED_EVIDENCE_PHOTOS"
                        :disabled="
                          order.status !== 'IN_PROGRESS' && order.status !== 'REQUIRES_CORRECTION'
                        "
                        @updated="loadData"
                      />
                    </div>
                  </div>
                </div>
              </NTabPane>
            </NTabs>
          </NCard>

          <!-- Signature Section -->
          <SignaturePad
            v-if="
              order &&
              (order.status === 'IN_PROGRESS' ||
                order.status === 'REQUIRES_CORRECTION' ||
                order.signature)
            "
            data-tour="execution-signature"
            :order-id="orderId"
            :existing-signature="order.signature"
            :disabled="order.status !== 'IN_PROGRESS' && order.status !== 'REQUIRES_CORRECTION'"
            :saving="savingSignature"
            @save="handleSaveSignature"
          />

          <NCard title="Notas de ejecución" class="shadow-sm">
            <div class="space-y-3">
              <NInput
                v-model:value="executionNotes"
                type="textarea"
                :rows="4"
                maxlength="5000"
                show-count
                placeholder="Agregue observaciones o notas finales del servicio..."
                :disabled="order.status !== 'IN_PROGRESS' || savingExecutionNotes"
                @update:value="executionNotesDirty = true"
              />
              <div class="flex justify-end">
                <NButton
                  type="primary"
                  secondary
                  :loading="savingExecutionNotes"
                  :disabled="order.status !== 'IN_PROGRESS' || !executionNotesDirty"
                  @click="handleSaveExecutionNotes"
                >
                  Guardar notas
                </NButton>
              </div>
            </div>
          </NCard>

          <!-- Completeness & Closure Section -->
          <NCard
            data-tour="execution-close"
            title="Cierre y Finalización del Servicio"
            class="shadow-sm"
          >
            <div class="space-y-4">
              <div
                v-if="completeness"
                class="p-3 rounded-lg border text-xs"
                :class="
                  completeness.isComplete
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-200'
                "
              >
                <span class="font-bold block mb-1">
                  {{
                    completeness.isComplete
                      ? 'Todos los requisitos de cierre están cumplidos'
                      : 'Requisitos pendientes para finalizar:'
                  }}
                </span>
                <ul
                  v-if="!completeness.isComplete"
                  class="list-disc list-inside space-y-0.5 text-amber-900"
                >
                  <li v-for="(req, idx) in completeness.missingRequirements" :key="idx">
                    {{ req }}
                  </li>
                </ul>
              </div>

              <div
                class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-2"
              >
                <NButton
                  v-if="order.status === 'IN_PROGRESS' || order.status === 'ASSIGNED'"
                  type="error"
                  secondary
                  size="small"
                  class="order-2 sm:order-1"
                  @click="showFailedModal = true"
                >
                  Reportar Cita Fallida
                </NButton>

                <NButton
                  v-if="order.status === 'COMPLETED' && session.user?.role === 'ADMIN'"
                  type="warning"
                  secondary
                  size="small"
                  class="order-2 sm:order-1"
                  @click="showCorrectionModal = true"
                >
                  Solicitar Corrección (Admin)
                </NButton>

                <NButton
                  v-if="order.status === 'IN_PROGRESS' || order.status === 'REQUIRES_CORRECTION'"
                  type="primary"
                  size="medium"
                  class="order-1 sm:order-2 w-full sm:w-auto"
                  :disabled="!completeness?.isComplete"
                  @click="handleCompleteOrder"
                >
                  Finalizar y Cerrar Servicio
                </NButton>
              </div>
            </div>
          </NCard>
        </div>
      </NSpin>

      <!-- Discrepancy Modal -->
      <NModal
        v-model:show="showDiscrepancyModal"
        preset="card"
        title="Reportar Discrepancia de Equipo"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1"
              >Tipo de Discrepancia</label
            >
            <NRadioGroup v-model:value="discrepancyType" size="small">
              <NRadio value="IMEI">IMEI</NRadio>
              <NRadio value="ID">ID</NRadio>
              <NRadio value="SERIAL">Serie</NRadio>
              <NRadio value="UNIT">Unidad</NRadio>
              <NRadio value="OTHER">Otro</NRadio>
            </NRadioGroup>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1"
              >Descripción de la discrepancia *</label
            >
            <NInput
              v-model:value="discrepancyDesc"
              type="textarea"
              rows="3"
              placeholder="Detalle lo observado en campo..."
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <NButton @click="showDiscrepancyModal = false">Cancelar</NButton>
            <NButton type="warning" @click="handleSaveDiscrepancy">Guardar Discrepancia</NButton>
          </div>
        </div>
      </NModal>

      <!-- Failed Appointment Modal -->
      <NModal
        v-model:show="showFailedModal"
        preset="card"
        title="Reportar Cita Fallida"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-3">
          <p class="text-xs text-slate-500">
            Al marcar la orden como cita fallida no se requiere checklist, fotos ni firma. Los
            equipos asignados serán liberados para su reasignación.
          </p>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1"
              >Motivo de la Cita Fallida *</label
            >
            <NInput
              v-model:value="failedReason"
              type="textarea"
              rows="3"
              placeholder="Ej: Cliente ausente, taller cerrado, unidad descompuesta..."
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <NButton @click="showFailedModal = false">Cancelar</NButton>
            <NButton type="error" :disabled="!failedReason.trim()" @click="handleFailAppointment">
              Confirmar Cita Fallida
            </NButton>
          </div>
        </div>
      </NModal>

      <!-- Admin Correction Modal -->
      <NModal
        v-model:show="showCorrectionModal"
        preset="card"
        title="Solicitar Corrección al Técnico"
        class="w-[92vw] max-w-md"
      >
        <div class="space-y-3">
          <p class="text-xs text-slate-500">
            La orden regresará al estado "Requiere Corrección" para que el técnico complete los
            requisitos indicados.
          </p>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1"
              >Instrucciones de Corrección *</label
            >
            <NInput
              v-model:value="correctionNotes"
              type="textarea"
              rows="3"
              placeholder="Detalle qué evidencia o dato debe ser subsanado..."
            />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <NButton @click="showCorrectionModal = false">Cancelar</NButton>
            <NButton
              type="warning"
              :disabled="!correctionNotes.trim()"
              @click="handleRequireCorrection"
            >
              Solicitar Corrección
            </NButton>
          </div>
        </div>
      </NModal>
    </div>
  </app-layout>
</template>
