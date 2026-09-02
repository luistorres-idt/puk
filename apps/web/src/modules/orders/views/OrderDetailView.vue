<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NButton,
  NCard,
  NTag,
  NModal,
  NInput,
  NInputNumber,
  NAlert,
  NSpin,
  NPopconfirm,
} from 'naive-ui';
import type { ExternalEquipment } from '@puk/contracts';
import { EquipmentSelect } from '../../external-catalogs/index.js';
import { useSessionStore } from '../../../stores/session.js';
import {
  fetchOrderById,
  assignOrder,
  cancelOrder,
  addUnit,
  deleteUnit,
  assignEquipment,
  removeEquipment,
  fetchSyncStatus,
  retrySync,
  type OrderDetail,
} from '../api.js';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const orderId = String(route.params.id);
const order = ref<OrderDetail | null>(null);
const syncInfo = ref<{
  isFullySynced: boolean;
  total: number;
  synced: number;
  failed: number;
  pending: number;
  operations: Array<Record<string, unknown>>;
} | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

function getErrorMessage(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: { message?: string } } } }).response;
    return response?.data?.error?.message || defaultMessage;
  }
  return defaultMessage;
}

// Modal states
const showAddUnitModal = ref(false);
const showAddEqModal = ref(false);
const showCancelModal = ref(false);
const cancelReason = ref('');
const targetUnitId = ref<string | null>(null);

// Unit form
const newUnit = ref({
  label: '',
  makeModel: '',
  serialNumber: '',
  year: 2024,
});

// Equipment form
const selectedEquipmentKey = ref<string | null>(null);
const selectedEquipment = ref<ExternalEquipment | null>(null);

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const [orderData, syncData] = await Promise.all([
      fetchOrderById(orderId),
      fetchSyncStatus(orderId).catch(() => null),
    ]);
    order.value = orderData;
    syncInfo.value = syncData;
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
        : undefined;
    error.value = message || 'Error al cargar la orden';
  } finally {
    loading.value = false;
  }
}

async function handleAddUnit() {
  if (!newUnit.value.label || !newUnit.value.makeModel || !newUnit.value.serialNumber) return;
  try {
    await addUnit(orderId, {
      label: newUnit.value.label,
      makeModel: newUnit.value.makeModel,
      serialNumber: newUnit.value.serialNumber,
      year: newUnit.value.year,
    });
    showAddUnitModal.value = false;
    newUnit.value = { label: '', makeModel: '', serialNumber: '', year: 2024 };
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al agregar unidad'));
  }
}

async function handleDeleteUnit(unitId: string) {
  try {
    await deleteUnit(orderId, unitId);
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al eliminar unidad'));
  }
}

function openAddEquipment(unitId: string) {
  targetUnitId.value = unitId;
  selectedEquipmentKey.value = null;
  selectedEquipment.value = null;
  showAddEqModal.value = true;
}

function handleEquipmentSelect(eq: ExternalEquipment | null) {
  selectedEquipment.value = eq;
}

async function handleAddEquipment() {
  if (!targetUnitId.value || !selectedEquipment.value || !selectedEquipmentKey.value) return;
  try {
    await assignEquipment(orderId, targetUnitId.value, {
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
    });
    showAddEqModal.value = false;
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al asignar equipo'));
  }
}

async function handleRemoveEquipment(unitId: string, equipmentId: string) {
  try {
    await removeEquipment(orderId, unitId, equipmentId);
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al desasignar equipo'));
  }
}

async function handleAssignAndSync() {
  try {
    await assignOrder(orderId);
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al asignar orden'));
  }
}

async function handleCancelOrder() {
  try {
    await cancelOrder(orderId, cancelReason.value || undefined);
    showCancelModal.value = false;
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al cancelar orden'));
  }
}

async function handleRetrySync() {
  try {
    await retrySync(orderId);
    await loadData();
  } catch (err: unknown) {
    alert(getErrorMessage(err, 'Error al reintentar sincronización'));
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="space-y-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <NButton secondary @click="router.push('/orders')">← Volver</NButton>
        <h1 class="text-2xl font-bold text-slate-800">
          Orden <span class="font-mono text-indigo-600">{{ order?.folio }}</span>
        </h1>
        <NTag v-if="order" :type="order.status === 'COMPLETED' ? 'success' : order.status === 'ASSIGNED' ? 'info' : 'default'">
          {{ order.status }}
        </NTag>
      </div>

      <div v-if="order && session.user?.role === 'ADMIN'" class="flex gap-2">
        <NButton
          v-if="order.status === 'DRAFT' || order.status === 'REQUIRES_CORRECTION'"
          type="primary"
          @click="handleAssignAndSync"
        >
          Asignar y Sincronizar
        </NButton>

        <NButton
          v-if="order.status !== 'COMPLETED' && order.status !== 'CANCELLED'"
          type="error"
          secondary
          @click="showCancelModal = true"
        >
          Cancelar Orden
        </NButton>
      </div>
    </div>

    <NAlert v-if="error" type="error" closable class="mb-4">
      {{ error }}
    </NAlert>

    <!-- Sync status banner (Phase 7) -->
    <NCard v-if="syncInfo && syncInfo.total > 0" class="border-l-4 border-l-indigo-500 shadow-sm">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-semibold text-slate-800">Sincronización con Google Sheets</h3>
          <p class="text-xs text-slate-500">
            Operaciones sincronizadas: {{ syncInfo.synced }} / {{ syncInfo.total }}
            <span v-if="syncInfo.failed > 0" class="text-red-500 font-bold ml-2">
              ({{ syncInfo.failed }} fallidas)
            </span>
          </p>
        </div>

        <NButton
          v-if="syncInfo.failed > 0 && session.user?.role === 'ADMIN'"
          size="small"
          type="warning"
          @click="handleRetrySync"
        >
          Reintentar Sincronización
        </NButton>
      </div>
    </NCard>

    <NSpin :show="loading">
      <div v-if="order" class="space-y-6">
        <!-- Order Header Details -->
        <NCard class="shadow-sm">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span class="text-xs text-slate-500 block">Cliente</span>
              <span class="font-bold text-slate-800">{{ order.clientNameSnapshot }}</span>
              <span class="text-xs text-slate-400 block font-mono">ID: {{ order.clientSheetId }}</span>
            </div>
            <div>
              <span class="text-xs text-slate-500 block">Tipo de Servicio</span>
              <span class="font-semibold text-slate-800">{{ order.serviceType }}</span>
              <span class="text-xs text-slate-500 block">
                {{ order.isHomeService ? 'A domicilio' : 'En taller' }}
              </span>
            </div>
            <div>
              <span class="text-xs text-slate-500 block">Técnico Asignado</span>
              <span class="font-semibold text-slate-800">{{ order.technician?.name || 'Sin asignar' }}</span>
              <span class="text-xs text-slate-400 block">
                Cita: {{ new Date(order.scheduledAt).toLocaleString() }}
              </span>
            </div>
          </div>
          <div v-if="order.generalNotes" class="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
            <strong>Notas:</strong> {{ order.generalNotes }}
          </div>
        </NCard>

        <!-- Units & Equipment Section -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-bold text-slate-800">
              Unidades de la Orden ({{ order.units?.length || 0 }})
            </h2>

            <NButton
              v-if="order.status === 'DRAFT' && session.user?.role === 'ADMIN'"
              size="small"
              type="primary"
              secondary
              @click="showAddUnitModal = true"
            >
              + Agregar Unidad
            </NButton>
          </div>

          <div v-if="order.units?.length === 0" class="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <p class="text-sm text-slate-500">No hay unidades registradas en esta orden.</p>
            <NButton
              v-if="order.status === 'DRAFT' && session.user?.role === 'ADMIN'"
              size="small"
              type="primary"
              class="mt-2"
              @click="showAddUnitModal = true"
            >
              Registrar Primera Unidad
            </NButton>
          </div>

          <div v-for="unit in order.units" :key="unit.id" class="space-y-2">
            <NCard class="shadow-sm">
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-base text-slate-800">{{ unit.label }}</span>
                    <NTag size="small">{{ unit.status }}</NTag>
                  </div>
                  <p class="text-xs text-slate-500 mt-1">
                    {{ unit.makeModel }} {{ unit.year ? `(${unit.year})` : '' }} • Serie: <span class="font-mono">{{ unit.serialNumber }}</span>
                  </p>
                </div>

                <div v-if="order.status === 'DRAFT' && session.user?.role === 'ADMIN'" class="flex gap-2">
                  <NButton size="tiny" type="primary" secondary @click="openAddEquipment(unit.id)">
                    + Asignar Equipo
                  </NButton>
                  <NPopconfirm @positive-click="handleDeleteUnit(unit.id)">
                    <template #trigger>
                      <NButton size="tiny" type="error" secondary>Eliminar</NButton>
                    </template>
                    ¿Eliminar esta unidad y sus equipos asignados?
                  </NPopconfirm>
                </div>
              </div>

              <!-- Equipments of Unit -->
              <div class="mt-4 pt-3 border-t border-slate-100">
                <span class="text-xs font-semibold text-slate-600 block mb-2">
                  Equipos asignados ({{ unit.equipment?.length || 0 }}):
                </span>

                <div v-if="unit.equipment?.length === 0" class="text-xs text-slate-400 italic">
                  Sin equipos asignados a esta unidad.
                </div>

                <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    v-for="eq in unit.equipment"
                    :key="eq.id"
                    class="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between items-center text-xs"
                  >
                    <div>
                      <span class="font-bold text-slate-800">{{ eq.brandSnapshot }} {{ eq.modelSnapshot }}</span>
                      <span class="block text-slate-500 font-mono">
                        [ID: {{ eq.externalId || 'N/A' }}] [IMEI: {{ eq.imei || 'N/A' }}]
                      </span>
                      <span class="text-slate-400 block">
                        Estado: {{ eq.equipmentConditionSnapshot || 'N/A' }}
                      </span>
                    </div>

                    <NButton
                      v-if="order.status === 'DRAFT' && session.user?.role === 'ADMIN'"
                      size="tiny"
                      type="error"
                      quaternary
                      @click="handleRemoveEquipment(unit.id, eq.id)"
                    >
                      ✕
                    </NButton>
                  </div>
                </div>
              </div>
            </NCard>
          </div>
        </div>
      </div>
    </NSpin>

    <!-- Modal: Add Unit -->
    <NModal v-model:show="showAddUnitModal" preset="card" title="Agregar Unidad a la Orden" class="max-w-md">
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Identificador / Etiqueta</label>
          <NInput v-model:value="newUnit.label" placeholder="Ej: Camión 01, T-12, Unidad Norte..." />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Marca y Modelo</label>
          <NInput v-model:value="newUnit.makeModel" placeholder="Ej: Kenworth T680, Ford F-150..." />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Número de Serie / VIN</label>
          <NInput v-model:value="newUnit.serialNumber" placeholder="Número de serie único de la unidad..." />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
          <NInputNumber v-model:value="newUnit.year" :min="1980" :max="2030" class="w-full" />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <NButton @click="showAddUnitModal = false">Cancelar</NButton>
          <NButton type="primary" @click="handleAddUnit">Guardar Unidad</NButton>
        </div>
      </div>
    </NModal>

    <!-- Modal: Add Equipment -->
    <NModal v-model:show="showAddEqModal" preset="card" title="Asignar Equipo desde Google Sheets" class="max-w-lg">
      <div class="space-y-4">
        <EquipmentSelect
          v-model="selectedEquipmentKey"
          @select="handleEquipmentSelect"
        />

        <div v-if="selectedEquipment" class="p-3 bg-slate-50 rounded text-xs space-y-1">
          <p><strong>Marca:</strong> {{ selectedEquipment.brand }} | <strong>Modelo:</strong> {{ selectedEquipment.model }}</p>
          <p><strong>Línea:</strong> {{ selectedEquipment.line || 'N/A' }} | <strong>Compañía:</strong> {{ selectedEquipment.carrier || 'N/A' }}</p>
          <p><strong>Estado:</strong> {{ selectedEquipment.condition || 'N/A' }} | <strong>Servicio:</strong> {{ selectedEquipment.serviceStatus || 'N/A' }}</p>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <NButton @click="showAddEqModal = false">Cancelar</NButton>
          <NButton
            type="primary"
            :disabled="!selectedEquipmentKey || !selectedEquipment?.hasValidIdentity"
            @click="handleAddEquipment"
          >
            Asignar a la Unidad
          </NButton>
        </div>
      </div>
    </NModal>

    <!-- Modal: Cancel Order -->
    <NModal v-model:show="showCancelModal" preset="card" title="Cancelar Orden de Servicio" class="max-w-md">
      <div class="space-y-4">
        <p class="text-sm text-slate-600">
          ¿Estás seguro de cancelar esta orden? Los equipos asignados serán liberados para su uso en otras órdenes.
        </p>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Motivo de la Cancelación</label>
          <NInput v-model:value="cancelReason" type="textarea" placeholder="Razón de la cancelación..." />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <NButton @click="showCancelModal = false">Cerrar</NButton>
          <NButton type="error" @click="handleCancelOrder">Confirmar Cancelación</NButton>
        </div>
      </div>
    </NModal>
  </div>
</template>
