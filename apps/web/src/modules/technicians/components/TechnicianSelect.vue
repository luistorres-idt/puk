<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { NAlert, NButton, NSelect, NTag } from 'naive-ui';
import type { TechnicianOption } from '@puk/contracts';
import { fetchSelectableTechnicians } from '../api.js';
import { filterTechnicians, getUniqueCities, getUniqueWorkshops } from '../technician-filter.js';
import { extractApiErrorMessage } from '@/shared/http/client.js';

const props = defineProps<{
  modelValue?: string | null | undefined;
  disabled?: boolean | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'select', technician: TechnicianOption | null): void;
  (e: 'loaded', count: number): void;
}>();

const technicians = ref<TechnicianOption[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const fetchedAt = ref<string | null>(null);

const selectedCity = ref<string | null>(null);
const selectedWorkshop = ref<string | null>(null);

const availableCities = computed(() => getUniqueCities(technicians.value));
const availableWorkshops = computed(() => getUniqueWorkshops(technicians.value));

const hasActiveFilters = computed(() => Boolean(selectedCity.value || selectedWorkshop.value));

const filteredTechnicians = computed(() =>
  filterTechnicians(technicians.value, {
    city: selectedCity.value,
    workshop: selectedWorkshop.value,
  }),
);

const selectedTechnician = computed(
  () => technicians.value.find((t) => t.id === props.modelValue) ?? null,
);

const selectOptions = computed(() =>
  filteredTechnicians.value.map((t) => ({
    label: [t.name, t.workshop, t.city].filter(Boolean).join(' · '),
    value: t.id,
  })),
);

async function loadTechnicians(force = false) {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetchSelectableTechnicians({ forceFresh: force });
    technicians.value = res.technicians;
    fetchedAt.value = res.fetchedAt;
    emit('loaded', res.technicians.length);

    // If currently selected technician is no longer in directory, clear selection
    if (props.modelValue && !res.technicians.some((t) => t.id === props.modelValue)) {
      emit('update:modelValue', null);
      emit('select', null);
    }
  } catch (err: unknown) {
    technicians.value = [];
    emit('update:modelValue', null);
    emit('select', null);
    error.value = extractApiErrorMessage(err, 'Directorio temporalmente no disponible');
  } finally {
    loading.value = false;
  }
}

function handleUpdate(value: string | null) {
  emit('update:modelValue', value);
  const selected = technicians.value.find((t) => t.id === value) || null;
  emit('select', selected);
}

function clearFilters() {
  selectedCity.value = null;
  selectedWorkshop.value = null;
}

watch(
  () => props.modelValue,
  (val) => {
    const selected = technicians.value.find((t) => t.id === val) || null;
    emit('select', selected);
  },
);

onMounted(() => {
  loadTechnicians();
});

defineExpose({
  loadTechnicians,
  clearFilters,
  technicians,
  filteredTechnicians,
});
</script>

<template>
  <div class="space-y-3">
    <!-- Header with Google Sheets label and refresh action -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <label class="block text-sm font-semibold text-slate-700">
          Técnico Asignado (Hoja DIRECTORIO TECNICO)
        </label>
        <p class="text-xs text-slate-500">
          Selecciona un técnico activo del catálogo sincronizado con Google Sheets.
        </p>
      </div>
      <div v-if="fetchedAt" class="flex items-center gap-2 text-xs text-slate-500">
        <span>Obtenido: {{ new Date(fetchedAt).toLocaleTimeString() }}</span>
        <button
          type="button"
          class="text-indigo-600 hover:underline font-medium disabled:opacity-50"
          :disabled="loading || props.disabled"
          @click="loadTechnicians(true)"
        >
          Recargar directorio
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <NAlert v-if="error" type="error" role="alert" class="text-xs">
      <div class="flex items-center justify-between">
        <span>{{ error }}</span>
        <NButton size="tiny" secondary @click="loadTechnicians()">Reintentar</NButton>
      </div>
    </NAlert>

    <!-- Empty Catalog Alert -->
    <NAlert v-else-if="!loading && technicians.length === 0" type="warning">
      No hay técnicos activos disponibles. Recarga el directorio para volver a consultar.
    </NAlert>

    <!-- Filter Bar (City and Workshop dropdowns) -->
    <div
      v-if="technicians.length > 0"
      class="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-500">
          Filtros de técnicos ({{ technicians.length }} en directorio)
        </span>
        <button
          v-if="hasActiveFilters"
          type="button"
          class="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          @click="clearFilters"
        >
          Limpiar filtros
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Filtrar por Ciudad</label>
          <NSelect
            v-model:value="selectedCity"
            :options="availableCities.map((c) => ({ label: c, value: c }))"
            placeholder="Todas las ciudades..."
            clearable
            size="small"
            :disabled="loading || props.disabled"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Filtrar por Taller</label>
          <NSelect
            v-model:value="selectedWorkshop"
            :options="availableWorkshops.map((w) => ({ label: w, value: w }))"
            placeholder="Todos los talleres..."
            clearable
            size="small"
            :disabled="loading || props.disabled"
          />
        </div>
      </div>

      <div class="flex items-center justify-between text-xs text-slate-500 pt-1">
        <span>
          Disponibles según filtro:
          <strong>{{ filteredTechnicians.length }}</strong> de {{ technicians.length }}
        </span>
        <NTag v-if="hasActiveFilters" size="tiny" type="info" :bordered="false">
          Filtro aplicado
        </NTag>
      </div>
    </div>

    <!-- Main Technician Select -->
    <div class="space-y-1">
      <label class="block text-xs font-medium text-slate-700">Seleccionar Técnico *</label>
      <NSelect
        :value="props.modelValue ?? null"
        :options="selectOptions"
        :loading="loading"
        :disabled="loading || !!error || props.disabled"
        filterable
        placeholder="Buscar por técnico, taller o ciudad..."
        clearable
        @update:value="handleUpdate"
      />
      <p
        v-if="hasActiveFilters && filteredTechnicians.length === 0"
        class="text-xs text-amber-600 mt-1"
      >
        No hay técnicos que coincidan con los filtros seleccionados. Intenta limpiar los filtros.
      </p>
    </div>

    <!-- Selected Technician Details Card -->
    <div
      v-if="selectedTechnician"
      class="p-3 bg-white rounded-lg border border-slate-200 shadow-sm space-y-2 text-xs"
    >
      <div class="flex items-start justify-between">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-800">{{ selectedTechnician.name }}</span>
            <NTag v-if="selectedTechnician.externalKey" size="tiny" type="success">
              {{ selectedTechnician.externalKey }}
            </NTag>
          </div>
          <p class="text-slate-600">
            <strong>Taller:</strong> {{ selectedTechnician.workshop || 'Sin taller asignado' }}
          </p>
        </div>
        <NTag size="tiny" type="info" round>DIRECTORIO TECNICO</NTag>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-500 pt-1 border-t">
        <p>
          <strong>Ubicación:</strong>
          {{
            [selectedTechnician.city, selectedTechnician.state].filter(Boolean).join(', ') ||
            'Sin ubicación'
          }}
        </p>
        <p v-if="selectedTechnician.phone">
          <strong>Teléfono:</strong> {{ selectedTechnician.phone }}
        </p>
      </div>
    </div>
  </div>
</template>
