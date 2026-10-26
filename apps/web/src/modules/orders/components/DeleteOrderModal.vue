<script setup lang="ts">
import { NAlert, NButton, NInput, NModal } from 'naive-ui';

defineProps<{
  show: boolean;
  folio?: string | undefined;
  loading?: boolean | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'confirm'): void;
}>();

const reason = defineModel<string>('reason', { default: '' });

function handleClose() {
  emit('update:show', false);
}

function handleConfirm() {
  emit('confirm');
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="Eliminar Orden de Servicio"
    class="w-[92vw] max-w-md"
    @update:show="emit('update:show', $event)"
  >
    <div class="space-y-4">
      <p class="text-sm text-slate-600">
        ¿Estás seguro de que deseas eliminar la orden
        <span class="font-mono font-bold text-indigo-700">{{ folio }}</span>?
      </p>
      <n-alert type="warning" :show-icon="true">
        Esta acción anulará la orden y los equipos asignados serán liberados inmediatamente para su
        uso en otras órdenes.
      </n-alert>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">
          Motivo de la eliminación (opcional)
        </label>
        <n-input
          v-model:value="reason"
          type="textarea"
          placeholder="Razón por la cual se elimina la orden..."
        />
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <n-button :disabled="loading" @click="handleClose">Cancelar</n-button>
        <n-button type="error" :loading="loading" @click="handleConfirm">
          Confirmar Eliminación
        </n-button>
      </div>
    </div>
  </n-modal>
</template>
