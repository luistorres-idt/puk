<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { NSelect, NButton, NAlert } from 'naive-ui';
import type { ExternalEquipment, OrderServiceType } from '@puk/contracts';
import { fetchEquipment, refreshCatalogs } from '../api.js';
import { filterEquipmentByServiceType } from '../equipment-filter.js';

const props = defineProps<{
  modelValue?: string | null | undefined;
  disabled?: boolean | undefined;
  serviceType?: OrderServiceType | string | null | undefined;
  clientName?: string | null | undefined;
  excludeKeys?: readonly string[] | Set<string> | null | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'select', equipment: ExternalEquipment | null): void;
}>();

const equipmentList = ref<ExternalEquipment[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const fetchedAt = ref<string | null>(null);

const filteredEquipment = computed(() => {
  let effectiveExcludeKeys = props.excludeKeys;
  if (props.modelValue && props.excludeKeys) {
    if (props.excludeKeys instanceof Set) {
      if (props.excludeKeys.has(props.modelValue)) {
        const nextSet = new Set(props.excludeKeys);
        nextSet.delete(props.modelValue);
        effectiveExcludeKeys = nextSet;
      }
    } else if (Array.isArray(props.excludeKeys)) {
      if (props.excludeKeys.includes(props.modelValue)) {
        effectiveExcludeKeys = props.excludeKeys.filter((k) => k !== props.modelValue);
      }
    }
  }

  return filterEquipmentByServiceType(equipmentList.value, {
    serviceType: props.serviceType,
    clientName: props.clientName,
    excludeKeys: effectiveExcludeKeys,
  });
});

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
      <label class="text-sm font-medium text-slate-700">
        Equipo (Pestaña SALIDAS)
        <span
          v-if="props.serviceType === 'INSTALLATION'"
          class="text-xs text-slate-500 font-normal"
        >
          (solo disponibles)
        </span>
        <span
          v-else-if="props.serviceType === 'REVIEW' || props.serviceType === 'UNINSTALLATION'"
          class="text-xs text-slate-500 font-normal"
        >
          (solo instalados del cliente)
        </span>
      </label>
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
        filteredEquipment.map((e) => {
          let label = `${e.brand || ''} ${e.model || ''} - [ID: ${e.id || 'N/A'}] [IMEI: ${e.imei || 'N/A'}]`;
          if (e.unit) {
            label += ` [Unidad: ${e.unit}]`;
          }
          if (e.serviceStatus) {
            label += ` (${e.serviceStatus})`;
          }
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

    <p v-if="!loading && filteredEquipment.length === 0" class="text-xs text-amber-600">
      {{
        props.serviceType === 'INSTALLATION'
          ? 'No se encontraron equipos disponibles en stock en Google Sheets.'
          : props.serviceType === 'REVIEW' || props.serviceType === 'UNINSTALLATION'
            ? 'No se encontraron equipos instalados para este cliente en Google Sheets.'
            : 'No se encontraron equipos en Google Sheets.'
      }}
    </p>
  </div>
</template>
