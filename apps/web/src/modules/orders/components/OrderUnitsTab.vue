<script setup lang="ts">
import { NButton, NCard, NPopconfirm, NTag } from 'naive-ui';
import type { OrderDetail } from '../api.js';
import {
  formatEquipmentStatus,
  formatServiceType,
  formatUnitStatus,
  unitStatusTagType,
} from '../formatters.js';

defineProps<{
  order: OrderDetail;
  canAddItems: boolean;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'add-unit': [];
  'attach-equipment': [unitId: string];
  'delete-unit': [unitId: string];
  'remove-equipment': [unitId: string, equipmentId: string];
}>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-base font-bold text-slate-800">
        Unidades Registradas ({{ order.units?.length || 0 }})
      </h2>

      <n-button v-if="canAddItems" size="small" type="primary" secondary @click="emit('add-unit')">
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
        @click="emit('add-unit')"
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
              {{ unit.makeModel }} {{ unit.year ? `(${unit.year})` : '' }} &bull; Serie / VIN:
              <span class="font-mono font-medium text-slate-700">{{ unit.serialNumber }}</span>
            </p>
          </div>

          <div
            v-if="order.status === 'DRAFT' && isAdmin"
            class="flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <n-button
              v-if="canAddItems"
              size="tiny"
              type="primary"
              secondary
              @click="emit('attach-equipment', unit.id)"
            >
              + Asignar Equipo
            </n-button>
            <n-popconfirm @positive-click="emit('delete-unit', unit.id)">
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
                  <span v-if="eq.verificationStatus" class="ml-2 font-semibold text-indigo-600">
                    [{{ formatEquipmentStatus(eq.verificationStatus) }}]
                  </span>
                </span>
              </div>

              <n-button
                v-if="order.status === 'DRAFT' && isAdmin"
                size="tiny"
                type="error"
                quaternary
                @click="emit('remove-equipment', unit.id, eq.id)"
              >
                Quitar
              </n-button>
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>
