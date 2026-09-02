<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NSelect, NButton, NAlert } from 'naive-ui';
import type { ExternalEquipment } from '@puk/contracts';
import { fetchEquipment, refreshCatalogs } from '../api.js';

const props = defineProps<{
  modelValue?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'select', equipment: ExternalEquipment | null): void;
}>();

const equipmentList = ref<ExternalEquipment[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const fetchedAt = ref<string | null>(null);

async function loadEquipment(force = false) {
  loading.value = true;
  error.value = null;
  try {
    if (force) {
      await refreshCatalogs();
    }
    const res = await fetchEquipment();
    equipmentList.value = res.equipment;
    fetchedAt.value = res.fetchedAt;
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
            ?.message
        : undefined;
    error.value = message || 'Error al cargar el catálogo de equipos';
  } finally {
    loading.value = false;
  }
}

function handleUpdate(value: string | null) {
  emit('update:modelValue', value);
  const selected = equipmentList.value.find((e) => e.externalKey === value) || null;
  emit('select', selected);
}

onMounted(() => {
  loadEquipment();
});
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium text-slate-700">Equipo (Pestaña SALIDAS)</label>
      <div v-if="fetchedAt" class="text-xs text-slate-500">
        Obtenido: {{ new Date(fetchedAt).toLocaleTimeString() }}
        <button
          type="button"
          class="ml-2 text-indigo-600 hover:underline text-xs"
          :disabled="loading || props.disabled"
          @click="loadEquipment(true)"
        >
          Recargar
        </button>
      </div>
    </div>

    <NAlert v-if="error" type="error" closable class="mb-2">
      <div class="flex items-center justify-between">
        <span>{{ error }}</span>
        <NButton size="tiny" secondary @click="loadEquipment()">Reintentar</NButton>
      </div>
    </NAlert>

    <NSelect
      :value="props.modelValue ?? null"
      :options="
        equipmentList.map((e) => {
          let label = `${e.brand || ''} ${e.model || ''} - [ID: ${e.id || 'N/A'}] [IMEI: ${e.imei || 'N/A'}]`;
          if (!e.hasValidIdentity) {
            label += ' [Datos incompletos - No asignable]';
          }
          return {
            label,
            value: e.externalKey,
            disabled: !e.hasValidIdentity,
          };
        })
      "
      :loading="loading"
      :disabled="props.disabled || loading"
      filterable
      placeholder="Buscar equipo por ID, IMEI o modelo..."
      clearable
      @update:value="handleUpdate"
    />
  </div>
</template>
