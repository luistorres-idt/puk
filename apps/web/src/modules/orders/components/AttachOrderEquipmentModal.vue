<script setup lang="ts">
import { toRefs } from 'vue';
import { NButton, NModal, useMessage } from 'naive-ui';
import type { AssignEquipment } from '@puk/contracts';
import { EquipmentSelect } from '@/modules/external-catalogs';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import type { OrderDetail } from '../api.js';
import { useAttachOrderEquipment } from '../composables/useAttachOrderEquipment.js';

const props = defineProps<{
  orderId: string;
  order: OrderDetail | undefined;
  canAddItems: boolean;
  assignedEquipmentKeys: string[];
  attachEquipment: (input: {
    id: string;
    unitId: string;
    data: AssignEquipment;
  }) => Promise<unknown>;
  attachEquipmentPending: boolean;
}>();

const message = useMessage();
const { order, canAddItems } = toRefs(props);
const {
  showModal,
  targetUnit,
  selectedEquipmentKey,
  selectedEquipment,
  openAddEquipment,
  handleEquipmentSelect,
  handleAddEquipment,
} = useAttachOrderEquipment({
  orderId: props.orderId,
  order,
  canAddItems,
  attachEquipment: props.attachEquipment,
  notifySuccess: (text) => message.success(text),
  notifyError: (error, fallback) => message.error(extractApiErrorMessage(error, fallback)),
});

defineExpose({ openAddEquipment });
</script>

<template>
  <n-modal
    v-model:show="showModal"
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
          <strong>Línea:</strong> {{ selectedEquipment.line || 'N/A' }} | <strong>Compañía:</strong>
          {{ selectedEquipment.carrier || 'N/A' }}
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
        <n-button @click="showModal = false">Cancelar</n-button>
        <n-button
          type="primary"
          :disabled="!selectedEquipmentKey || !selectedEquipment?.hasValidIdentity"
          :loading="attachEquipmentPending"
          @click="handleAddEquipment"
        >
          Asignar a la Unidad
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
