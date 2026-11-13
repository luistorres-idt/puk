<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NInput,
  NInputNumber,
  NSwitch,
  NTabPane,
  NTabs,
} from 'naive-ui';
import type { CreateTechnician, UpdateTechnician } from '@puk/contracts';

import type { Technician } from '../api.js';

const props = defineProps<{
  show: boolean;
  technician: Technician | null;
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  submit: [payload: { id: string | null; data: CreateTechnician | UpdateTechnician }];
}>();

interface TechnicianFormState {
  active: boolean;
  address: string;
  city: string;
  departureCost: number | null;
  email: string;
  failedAppointmentRate: number | null;
  fuelSensorRate: number | null;
  installationRate: number | null;
  invoice: string;
  legalName: string;
  name: string;
  notes: string;
  phone: string;
  replacementRate: number | null;
  reviewRate: number | null;
  state: string;
  taxAddress: string;
  taxData: string;
  uninstallationRate: number | null;
  workshop: string;
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const form = reactive<TechnicianFormState>({
  active: true,
  address: '',
  city: '',
  departureCost: null,
  email: '',
  failedAppointmentRate: null,
  fuelSensorRate: null,
  installationRate: null,
  invoice: '',
  legalName: '',
  name: '',
  notes: '',
  phone: '',
  replacementRate: null,
  reviewRate: null,
  state: '',
  taxAddress: '',
  taxData: '',
  uninstallationRate: null,
  workshop: '',
});

watch(
  () => [props.show, props.technician] as const,
  ([visible, tech]) => {
    if (!visible) return;
    Object.assign(form, {
      active: tech?.active ?? true,
      address: tech?.address ?? '',
      city: tech?.city ?? '',
      departureCost: toNumberOrNull(tech?.departureCost),
      email: tech?.email ?? '',
      failedAppointmentRate: toNumberOrNull(tech?.failedAppointmentRate),
      fuelSensorRate: toNumberOrNull(tech?.fuelSensorRate),
      installationRate: toNumberOrNull(tech?.installationRate),
      invoice: tech?.invoice ?? '',
      legalName: tech?.legalName ?? '',
      name: tech?.name ?? '',
      notes: tech?.notes ?? '',
      phone: tech?.phone ?? '',
      replacementRate: toNumberOrNull(tech?.replacementRate),
      reviewRate: toNumberOrNull(tech?.reviewRate),
      state: tech?.state ?? '',
      taxAddress: tech?.taxAddress ?? '',
      taxData: tech?.taxData ?? '',
      uninstallationRate: toNumberOrNull(tech?.uninstallationRate),
      workshop: tech?.workshop ?? '',
    });
  },
  { immediate: true },
);

const isEditing = computed(() => props.technician !== null);
const canSubmit = computed(() => form.name.trim().length > 0);

const rateFields: ReadonlyArray<{
  key: keyof Pick<
    TechnicianFormState,
    | 'installationRate'
    | 'uninstallationRate'
    | 'replacementRate'
    | 'reviewRate'
    | 'fuelSensorRate'
    | 'failedAppointmentRate'
    | 'departureCost'
  >;
  label: string;
}> = [
  { key: 'installationRate', label: 'Instalación' },
  { key: 'uninstallationRate', label: 'Desinstalación' },
  { key: 'replacementRate', label: 'Cambio de equipo' },
  { key: 'reviewRate', label: 'Revisión' },
  { key: 'fuelSensorRate', label: 'Sensor de combustible' },
  { key: 'failedAppointmentRate', label: 'Cita fallida' },
  { key: 'departureCost', label: 'Costo salida del taller' },
];

function handleSubmit(): void {
  if (!canSubmit.value) return;

  const baseData: CreateTechnician = {
    address: toNullableText(form.address),
    city: toNullableText(form.city),
    departureCost: form.departureCost,
    email: toNullableText(form.email),
    failedAppointmentRate: form.failedAppointmentRate,
    fuelSensorRate: form.fuelSensorRate,
    installationRate: form.installationRate,
    invoice: toNullableText(form.invoice),
    legalName: toNullableText(form.legalName),
    name: form.name.trim(),
    notes: toNullableText(form.notes),
    phone: toNullableText(form.phone),
    replacementRate: form.replacementRate,
    reviewRate: form.reviewRate,
    state: toNullableText(form.state),
    taxAddress: toNullableText(form.taxAddress),
    taxData: toNullableText(form.taxData),
    uninstallationRate: form.uninstallationRate,
    workshop: toNullableText(form.workshop),
  };

  if (props.technician) {
    emit('submit', {
      id: props.technician.id,
      data: { ...baseData, active: form.active },
    });
  } else {
    emit('submit', { id: null, data: baseData });
  }
}
</script>

<template>
  <n-drawer
    :show="show"
    :width="520"
    placement="right"
    @update:show="(val) => emit('update:show', val)"
  >
    <n-drawer-content
      :title="isEditing ? `Editar técnico · ${technician?.externalKey ?? ''}` : 'Nuevo técnico'"
      closable
    >
      <n-tabs type="line" animated>
        <n-tab-pane name="general" tab="Datos generales">
          <div class="space-y-3 pt-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Nombre *</label>
              <n-input v-model:value="form.name" placeholder="Nombre completo del técnico" />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Taller</label>
                <n-input v-model:value="form.workshop" placeholder="Nombre del taller" clearable />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Teléfono</label>
                <n-input v-model:value="form.phone" placeholder="6621234567" clearable />
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Correo</label>
              <n-input v-model:value="form.email" placeholder="tecnico@ejemplo.com" clearable />
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Ciudad</label>
                <n-input v-model:value="form.city" placeholder="Hermosillo" clearable />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-slate-500">Estado</label>
                <n-input v-model:value="form.state" placeholder="Sonora" clearable />
              </div>
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Dirección</label>
              <n-input v-model:value="form.address" placeholder="Calle y número" clearable />
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Notas adicionales</label>
              <n-input
                v-model:value="form.notes"
                type="textarea"
                :rows="2"
                placeholder="Observaciones internas"
              />
            </div>

            <div v-if="isEditing" class="flex items-center justify-between pt-2">
              <span class="text-sm text-slate-700">Técnico activo</span>
              <n-switch v-model:value="form.active" />
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="rates" tab="Tarifas">
          <div class="space-y-3 pt-2">
            <p class="text-xs text-slate-500">
              Todos los montos son opcionales. Déjalos vacíos si no aplican para este técnico.
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div v-for="field in rateFields" :key="field.key">
                <label class="mb-1 block text-xs font-medium text-slate-500">
                  {{ field.label }}
                </label>
                <n-input-number
                  v-model:value="form[field.key]"
                  class="w-full"
                  :min="0"
                  :precision="2"
                  placeholder="0.00"
                  clearable
                >
                  <template #prefix>$</template>
                </n-input-number>
              </div>
            </div>
          </div>
        </n-tab-pane>

        <n-tab-pane name="fiscal" tab="Datos fiscales">
          <div class="space-y-3 pt-2">
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Razón social</label>
              <n-input
                v-model:value="form.legalName"
                placeholder="Nombre o razón social"
                clearable
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Factura</label>
              <n-input v-model:value="form.invoice" placeholder="Sí / No / Esquema" clearable />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Datos fiscales</label>
              <n-input
                v-model:value="form.taxData"
                type="textarea"
                :rows="2"
                placeholder="RFC, régimen fiscal"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-500">Dirección fiscal</label>
              <n-input
                v-model:value="form.taxAddress"
                type="textarea"
                :rows="2"
                placeholder="Domicilio fiscal completo"
              />
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <n-button @click="emit('update:show', false)">Cancelar</n-button>
          <n-button type="primary" :disabled="!canSubmit" :loading="saving" @click="handleSubmit">
            {{ isEditing ? 'Guardar cambios' : 'Crear técnico' }}
          </n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>
