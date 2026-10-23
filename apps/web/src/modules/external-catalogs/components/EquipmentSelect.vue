<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue';
import { NSelect, NButton, NAlert, NInput, NInputNumber, type SelectOption } from 'naive-ui';
import type { ExternalEquipment, OrderServiceType } from '@puk/contracts';
import { fetchEquipment, refreshCatalogs, registerEquipment } from '../api.js';
import { useSessionStore } from '@/stores/session';
import { useInventoryRegistration } from '../composables/useInventoryRegistration.js';
import { filterEquipmentByServiceType } from '../equipment-filter.js';

const props = defineProps<{
  modelValue?: string | null | undefined;
  disabled?: boolean | undefined;
  serviceType?: OrderServiceType | string | null | undefined;
  clientName?: string | null | undefined;
  clientSheetId?: string | null | undefined;
  unitContext?:
    | { label: string; makeModel: string; serialNumber: string; year?: number | null | undefined }
    | undefined;
  replacementRole?: 'OLD' | 'NEW' | undefined;
  excludeKeys?: readonly string[] | Set<string> | null | undefined;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'select', equipment: ExternalEquipment | null): void;
}>();

const session = useSessionStore();
const registrationAllowed = ref(false);
const warnings = ref<string[]>([]);
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
    clientSheetId: props.clientSheetId,
    excludeKeys: effectiveExcludeKeys,
  });
});

const registration = useInventoryRegistration(
  () => ({
    canRegister: session.user?.role === 'ADMIN',
    registrationAllowed: registrationAllowed.value,
    serviceType: props.serviceType,
    replacementRole: props.replacementRole,
    clientSheetId: props.clientSheetId,
    clientName: props.clientName,
    unit: props.unitContext,
  }),
  registerEquipment,
  async (created) => {
    await loadEquipment();
    if (!equipmentList.value.some((e) => e.externalKey === created.externalKey))
      equipmentList.value.push(created);
    const actual = equipmentList.value.find((e) => e.externalKey === created.externalKey)!;
    const compatible = filterEquipmentByServiceType([actual], {
      serviceType: props.serviceType,
      clientName: props.clientName,
      clientSheetId: props.clientSheetId,
      excludeKeys: props.excludeKeys,
    });
    if (compatible.length && actual.hasValidIdentity && !actual.identityConflict)
      handleUpdate(created.externalKey);
    else
      error.value =
        'Equipo registrado. No es compatible con el servicio o cliente actual; sus datos no se modificaron.';
  },
);
const {
  showForm,
  saving,
  error: registrationError,
  existingKeys,
  form,
  state: proposedState,
  replacementRole: formReplacementRole,
} = registration;
const existingChoices = computed(() =>
  filteredEquipment.value.filter(
    (e) => existingKeys.value.includes(e.externalKey) && e.hasValidIdentity && !e.identityConflict,
  ),
);

async function loadEquipment(force = false) {
  loading.value = true;
  error.value = null;
  registrationAllowed.value = false;
  try {
    if (force) {
      await refreshCatalogs();
    }
    const res = await fetchEquipment();
    equipmentList.value = res.equipment;
    warnings.value = res.warnings;
    registrationAllowed.value = res.registrationAllowed;
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

function renderEquipmentOptionLabel(option: SelectOption) {
  return h(
    'span',
    { class: 'block whitespace-normal break-words leading-snug py-0.5 text-xs sm:text-sm' },
    String(option.label ?? ''),
  );
}

watch(filteredEquipment, (available) => {
  if (!props.modelValue || loading.value) return;
  const selected = available.find(
    (e) => e.externalKey === props.modelValue && e.hasValidIdentity && !e.identityConflict,
  );
  if (!selected) {
    error.value =
      'El equipo seleccionado ya no es compatible con el servicio, cliente o catálogo actual. Selecciona otro; el inventario no se modificó.';
    handleUpdate(null);
  }
});

onMounted(() => {
  loadEquipment();
});
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
      <label class="text-sm font-medium text-slate-700">
        Equipo (BD / Google Sheets)
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

    <NAlert v-for="warning in warnings" :key="warning" type="warning">{{ warning }}</NAlert>

    <NSelect
      :value="props.modelValue ?? null"
      :options="
        filteredEquipment.map((e) => {
          let label = `${e.source === 'DB' ? '[BD] ' : '[Sheets] '}${e.brand || ''} ${e.model || ''} - [ID: ${e.id || 'N/A'}] [IMEI: ${e.imei || 'N/A'}]`;
          if (e.unit) {
            label += ` [Unidad: ${e.unit}]`;
          }
          if (e.serviceStatus) {
            label += ` (${e.serviceStatus})`;
          }
          if (!e.hasValidIdentity) {
            label += e.identityConflict
              ? ' [Conflicto de IMEI - No asignable]'
              : ' [Datos incompletos - No asignable]';
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
      :render-label="renderEquipmentOptionLabel"
      filterable
      placeholder="Buscar equipo por ID, IMEI o modelo..."
      clearable
      @update:value="handleUpdate"
    />

    <p v-if="!loading && filteredEquipment.length === 0" class="text-xs text-amber-600">
      {{
        props.serviceType === 'INSTALLATION'
          ? 'No se encontraron equipos disponibles en stock en el catálogo disponible.'
          : props.serviceType === 'REVIEW' || props.serviceType === 'UNINSTALLATION'
            ? 'No se encontraron equipos instalados para este cliente en el catálogo disponible.'
            : 'No se encontraron equipos en el catálogo disponible.'
      }}
    </p>

    <NButton
      v-if="session.user?.role === 'ADMIN' && !showForm"
      size="small"
      secondary
      :disabled="props.disabled || loading || !props.serviceType || !props.clientSheetId"
      @click="registration.open"
      >Registrar equipo nuevo</NButton
    >
    <div v-if="showForm" class="space-y-3 rounded border border-slate-200 p-3">
      <p class="text-sm font-medium">Registrar equipo en la BD</p>
      <p class="text-xs text-slate-500">
        El equipo se guarda independientemente de la orden. Estado inicial:
        {{ proposedState === 'INSTALLED' ? 'Instalado' : 'Disponible' }}.
      </p>
      <NAlert v-if="!registrationAllowed" type="warning"
        >Registro pausado: no se puede verificar el IMEI en Sheets. Los datos se conservarán para
        reintentar.</NAlert
      >
      <NSelect
        v-if="props.serviceType === 'EQUIPMENT_REPLACEMENT' && !props.replacementRole"
        v-model:value="formReplacementRole"
        :disabled="saving"
        :options="[
          { label: 'Equipo instalado a retirar', value: 'OLD' },
          { label: 'Equipo nuevo de reemplazo', value: 'NEW' },
        ]"
        placeholder="Rol del equipo"
      />
      <label class="block text-xs">Marca del equipo *</label
      ><NInput v-model:value="form.brand" :disabled="saving" placeholder="Marca" />
      <label class="block text-xs">Modelo del equipo *</label
      ><NInput v-model:value="form.model" :disabled="saving" placeholder="Modelo" />
      <label class="block text-xs">IMEI (15 dígitos) *</label
      ><NInput
        v-model:value="form.imei"
        :disabled="saving"
        placeholder="IMEI"
        :input-props="{ inputmode: 'numeric' }"
      />
      <template v-if="proposedState === 'INSTALLED'">
        <p class="text-xs">Cliente actual: {{ props.clientName }}</p>
        <label class="block text-xs">Etiqueta de la unidad *</label
        ><NInput v-model:value="form.label" :disabled="saving" placeholder="Etiqueta" />
        <label class="block text-xs">Marca/modelo de la unidad *</label
        ><NInput
          v-model:value="form.makeModel"
          :disabled="saving"
          placeholder="Marca/modelo de la unidad"
        />
        <label class="block text-xs">Número de serie de la unidad *</label
        ><NInput
          v-model:value="form.serialNumber"
          :disabled="saving"
          placeholder="Número de serie"
        />
        <label class="block text-xs">Año de la unidad</label
        ><NInputNumber v-model:value="form.year" :disabled="saving" :min="1900" :max="2100" />
      </template>
      <NAlert v-if="registrationError" type="error">{{ registrationError }}</NAlert>
      <NButton
        v-for="existing in existingChoices"
        :key="existing.externalKey"
        size="small"
        @click="
          handleUpdate(existing.externalKey);
          showForm = false;
        "
        >Seleccionar existente: {{ existing.brand }} {{ existing.model }} —
        {{ existing.imei }}</NButton
      >
      <div class="flex gap-2">
        <NButton :disabled="saving" @click="showForm = false">Cerrar</NButton>
        <NButton
          type="primary"
          :loading="saving"
          :disabled="props.disabled || !registrationAllowed || loading"
          @click="registration.save"
          >Guardar equipo</NButton
        >
        <NButton
          v-if="!registrationAllowed"
          :disabled="loading || saving"
          @click="loadEquipment(true)"
          >Reintentar catálogo</NButton
        >
      </div>
    </div>
  </div>
</template>
