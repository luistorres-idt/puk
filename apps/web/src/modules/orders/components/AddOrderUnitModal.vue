<script setup lang="ts">
import { toRefs } from 'vue';
import { NButton, NInput, NInputNumber, NModal, NSelect, useMessage } from 'naive-ui';
import { getMaxUnitYear, MIN_UNIT_YEAR, type CreateUnit } from '@puk/contracts';
import { EquipmentSelect } from '@/modules/external-catalogs';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import type { OrderDetail } from '../api.js';
import { useAddOrderUnit } from '../composables/useAddOrderUnit.js';

const props = defineProps<{
  orderId: string;
  order: OrderDetail | undefined;
  canAddItems: boolean;
  assignedEquipmentKeys: string[];
  insertUnit: (input: { id: string; data: CreateUnit }) => Promise<unknown>;
  insertUnitPending: boolean;
}>();

const message = useMessage();
const { order, canAddItems, assignedEquipmentKeys, insertUnitPending } = toRefs(props);
const {
  showAddUnitModal,
  newUnit,
  unitModalEquipmentKey,
  unitModalEquipment,
  isReviewOrUninstallation,
  isEquipmentReplacement,
  replacementNewEquipmentKey,
  replacementNewEquipment,
  excludeKeysForModalReplacementOld,
  excludeKeysForModalReplacementNew,
  serviceTypeOptions,
  handleReplacementNewSelect,
  handleUnitModalEquipmentSelect,
  openAddUnitModal,
  handleAddUnit,
} = useAddOrderUnit({
  orderId: props.orderId,
  order,
  canAddItems,
  assignedEquipmentKeys,
  insertUnit: props.insertUnit,
  notifyWarning: (text) => message.warning(text),
  notifySuccess: (text) => message.success(text),
  notifyError: (error, fallback) => message.error(extractApiErrorMessage(error, fallback)),
});

defineExpose({ openAddUnitModal });
</script>

<template>
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
            1. Selecciona el <strong>equipo actualmente instalado</strong> con el cliente (los datos
            del vehículo se vinculan automáticamente sin capturarlos).<br />
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
            :client-sheet-id="order?.clientSheetId"
            :unit-context="newUnit"
            :exclude-keys="excludeKeysForModalReplacementOld"
            @select="handleUnitModalEquipmentSelect"
          />

          <div v-if="unitModalEquipment" class="p-3 bg-slate-50 rounded border text-xs space-y-1">
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
            :client-sheet-id="order?.clientSheetId"
            :unit-context="newUnit"
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
      <div v-else-if="isReviewOrUninstallation" class="space-y-3 pt-2 border-t border-slate-100">
        <div class="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
          <p class="font-semibold mb-0.5">
            {{
              newUnit.serviceType === 'REVIEW' ? 'Revisión de Equipos' : 'Desinstalación de Equipos'
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
          :client-sheet-id="order?.clientSheetId"
          :unit-context="newUnit"
          :exclude-keys="assignedEquipmentKeys"
          @select="handleUnitModalEquipmentSelect"
        />

        <div v-if="unitModalEquipment" class="p-3 bg-slate-50 rounded border text-xs space-y-1">
          <p>
            <strong>Equipo:</strong> {{ unitModalEquipment.brand }} {{ unitModalEquipment.model }} |
            <strong>IMEI:</strong>
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
              <label class="block text-xs font-medium text-slate-600 mb-1">Marca y Modelo *</label>
              <n-input v-model:value="newUnit.makeModel" placeholder="Ej: Kenworth T680" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
              <n-input-number
                v-model:value="newUnit.year"
                :min="MIN_UNIT_YEAR"
                :max="getMaxUnitYear()"
                :precision="0"
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
            :client-sheet-id="order?.clientSheetId"
            :unit-context="newUnit"
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
          :loading="insertUnitPending"
          @click="handleAddUnit"
        >
          Guardar Unidad
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
