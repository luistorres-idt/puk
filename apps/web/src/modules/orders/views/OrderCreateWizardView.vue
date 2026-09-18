<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NSteps,
  NStep,
  NCard,
  NButton,
  NSelect,
  NInput,
  NInputNumber,
  NSwitch,
  NAlert,
  NDatePicker,
  NTag,
  NEmpty,
} from 'naive-ui';
import {
  ORDER_SERVICE_LABELS,
  OrderServiceTypeSchema,
  isServiceConfigurationSupported,
  type ExternalClient,
  type ExternalEquipment,
  type OrderServiceType,
  type TechnicianOption,
} from '@puk/contracts';
import {
  ClientSelect,
  EquipmentSelect,
  extractUnitFromEquipment,
  toEquipmentAssignment,
} from '../../external-catalogs/index.js';
import { TechnicianSelect } from '../../technicians/index.js';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import { createOrder } from '../api.js';
import AppLayout from '@/shared/layouts/AppLayout.vue';

const router = useRouter();

const currentStep = ref(1);
const loading = ref(false);
const error = ref<string | null>(null);

// Step 1: Client
const selectedClientId = ref<string | null>(null);
const selectedClient = ref<ExternalClient | null>(null);

function handleClientSelect(client: ExternalClient | null) {
  if (selectedClient.value?.id !== client?.id) {
    configuredUnits.value = [];
  }
  selectedClient.value = client;
}

// Step 2: Units & Services (grouped by service type)
export interface ConfiguredUnitItem {
  id: string;
  serviceType: OrderServiceType;
  label: string;
  makeModel: string;
  serialNumber: string;
  year: number | null;
  equipment: ExternalEquipment | null;
  replacementEquipment?: ExternalEquipment | null;
}

const configuredUnits = ref<ConfiguredUnitItem[]>([]);

export interface ServiceBlock {
  serviceType: OrderServiceType;
  label: string;
  units: ConfiguredUnitItem[];
}

const serviceBlocks = computed<ServiceBlock[]>(() => {
  const blocksMap = new Map<OrderServiceType, ConfiguredUnitItem[]>();
  for (const unit of configuredUnits.value) {
    if (!blocksMap.has(unit.serviceType)) {
      blocksMap.set(unit.serviceType, []);
    }
    blocksMap.get(unit.serviceType)!.push(unit);
  }
  return Array.from(blocksMap.entries()).map(([serviceType, units]) => ({
    serviceType,
    label: ORDER_SERVICE_LABELS[serviceType] ?? serviceType,
    units,
  }));
});

// Currently selected service to add units to
const activeServiceType = ref<OrderServiceType>('INSTALLATION');

const serviceTypeOptions = OrderServiceTypeSchema.options
  .filter((value) => value !== 'FAILED_APPOINTMENT')
  .map((value) => ({
    label: `${ORDER_SERVICE_LABELS[value]}${isServiceConfigurationSupported(value) ? '' : ' (próximamente)'}`,
    value,
    disabled: !isServiceConfigurationSupported(value),
  }));

// Form for Installation / Fuel Sensor / Equipment Replacement
const unitForm = ref({
  label: '',
  makeModel: '',
  serialNumber: '',
  year: new Date().getFullYear() as number | null,
});
const installationEquipmentKey = ref<string | null>(null);
const installationEquipment = ref<ExternalEquipment | null>(null);

function handleInstallationEquipmentSelect(eq: ExternalEquipment | null) {
  installationEquipment.value = eq;
}

function handleAddManualUnit(targetServiceType: OrderServiceType) {
  const { label, makeModel, serialNumber, year } = unitForm.value;
  if (!label.trim() || !makeModel.trim() || !serialNumber.trim()) {
    error.value = 'Por favor completa la etiqueta, marca/modelo y número de serie de la unidad.';
    return;
  }

  if (
    configuredUnits.value.some(
      (u) => u.serialNumber.trim().toLowerCase() === serialNumber.trim().toLowerCase(),
    )
  ) {
    error.value = 'Ya existe una unidad con ese número de serie en la orden.';
    return;
  }

  if (
    installationEquipment.value &&
    configuredUnits.value.some(
      (u) => u.equipment?.externalKey === installationEquipment.value?.externalKey,
    )
  ) {
    error.value = 'Ese equipo ya fue asignado a otra unidad en esta orden.';
    return;
  }

  error.value = null;

  configuredUnits.value.push({
    id: crypto.randomUUID(),
    serviceType: targetServiceType,
    label: label.trim(),
    makeModel: makeModel.trim(),
    serialNumber: serialNumber.trim(),
    year: typeof year === 'number' && year >= 1900 && year <= 2100 ? year : null,
    equipment: installationEquipment.value,
  });

  unitForm.value = {
    label: '',
    makeModel: '',
    serialNumber: '',
    year: new Date().getFullYear(),
  };
  installationEquipmentKey.value = null;
  installationEquipment.value = null;
}

// For Review / Uninstallation selection:
const reviewSelectedEquipmentKey = ref<string | null>(null);
const reviewSelectedEquipment = ref<ExternalEquipment | null>(null);

function handleReviewEquipmentSelect(eq: ExternalEquipment | null) {
  reviewSelectedEquipment.value = eq;
}

function handleAddReviewEquipment(targetServiceType: OrderServiceType) {
  if (!reviewSelectedEquipment.value) return;

  const eq = reviewSelectedEquipment.value;

  if (configuredUnits.value.some((u) => u.equipment?.externalKey === eq.externalKey)) {
    error.value = `El equipo ${eq.externalKey} ya fue agregado a la orden.`;
    return;
  }
  error.value = null;

  const extracted = extractUnitFromEquipment(eq);
  configuredUnits.value.push({
    id: crypto.randomUUID(),
    serviceType: targetServiceType,
    label: extracted.label,
    makeModel: extracted.makeModel,
    serialNumber: extracted.serialNumber,
    year: extracted.year,
    equipment: eq,
  });

  reviewSelectedEquipmentKey.value = null;
  reviewSelectedEquipment.value = null;
}

// For Equipment Replacement:
const replacementOldEquipmentKey = ref<string | null>(null);
const replacementOldEquipment = ref<ExternalEquipment | null>(null);
const replacementNewEquipmentKey = ref<string | null>(null);
const replacementNewEquipment = ref<ExternalEquipment | null>(null);

const assignedEquipmentKeys = computed<string[]>(() => {
  const keys: string[] = [];
  for (const u of configuredUnits.value) {
    if (u.equipment?.externalKey) {
      keys.push(u.equipment.externalKey);
    }
    if (u.replacementEquipment?.externalKey) {
      keys.push(u.replacementEquipment.externalKey);
    }
  }
  return keys;
});

const excludeKeysForReplacementOld = computed(() => {
  const keys = [...assignedEquipmentKeys.value];
  if (replacementNewEquipmentKey.value) {
    keys.push(replacementNewEquipmentKey.value);
  }
  return keys;
});

const excludeKeysForReplacementNew = computed(() => {
  const keys = [...assignedEquipmentKeys.value];
  if (replacementOldEquipmentKey.value) {
    keys.push(replacementOldEquipmentKey.value);
  }
  return keys;
});

function handleReplacementOldSelect(eq: ExternalEquipment | null) {
  replacementOldEquipment.value = eq;
}

function handleReplacementNewSelect(eq: ExternalEquipment | null) {
  replacementNewEquipment.value = eq;
}

function handleAddEquipmentReplacement() {
  if (!replacementOldEquipment.value || !replacementNewEquipment.value) {
    error.value = 'Selecciona el equipo instalado y el equipo nuevo de reemplazo.';
    return;
  }
  const oldEq = replacementOldEquipment.value;
  const newEq = replacementNewEquipment.value;

  if (
    configuredUnits.value.some(
      (u) =>
        u.equipment?.externalKey === oldEq.externalKey ||
        u.replacementEquipment?.externalKey === oldEq.externalKey,
    )
  ) {
    error.value = `El equipo instalado ${oldEq.externalKey} ya fue agregado a la orden.`;
    return;
  }

  if (
    configuredUnits.value.some(
      (u) =>
        u.replacementEquipment?.externalKey === newEq.externalKey ||
        u.equipment?.externalKey === newEq.externalKey,
    )
  ) {
    error.value = `El equipo de reemplazo ${newEq.externalKey} ya fue seleccionado en otra unidad.`;
    return;
  }

  error.value = null;
  const extracted = extractUnitFromEquipment(oldEq);

  configuredUnits.value.push({
    id: crypto.randomUUID(),
    serviceType: 'EQUIPMENT_REPLACEMENT',
    label: extracted.label,
    makeModel: extracted.makeModel,
    serialNumber: extracted.serialNumber,
    year: extracted.year,
    equipment: oldEq,
    replacementEquipment: newEq,
  });

  replacementOldEquipmentKey.value = null;
  replacementOldEquipment.value = null;
  replacementNewEquipmentKey.value = null;
  replacementNewEquipment.value = null;
}

function removeConfiguredUnit(unitId: string) {
  const index = configuredUnits.value.findIndex((u) => u.id === unitId);
  if (index >= 0) {
    configuredUnits.value.splice(index, 1);
  }
}

function removeBlock(serviceType: OrderServiceType) {
  configuredUnits.value = configuredUnits.value.filter((u) => u.serviceType !== serviceType);
}

function selectServiceBlockForAdding(serviceType: OrderServiceType) {
  activeServiceType.value = serviceType;
  error.value = null;
}

// Step 3: Schedule & Details
const scheduledAtTimestamp = ref<number>(Date.now() + 86400000);
const isHomeService = ref(false);
const serviceAddress = ref('');
const generalNotes = ref('');

// Step 4: Technician
const technicianId = ref<string | null>(null);
const selectedTechnician = ref<TechnicianOption | null>(null);

function handleTechnicianSelect(technician: TechnicianOption | null) {
  selectedTechnician.value = technician;
}

const hasValidTechnician = computed(() => Boolean(technicianId.value && selectedTechnician.value));

function canProceed(): boolean {
  if (currentStep.value === 1) {
    return !!selectedClientId.value;
  }
  if (currentStep.value === 2) {
    if (configuredUnits.value.length === 0) {
      return false;
    }
    return configuredUnits.value.every(
      (u) => u.label.trim() && u.makeModel.trim() && u.serialNumber.trim(),
    );
  }
  if (currentStep.value === 3) {
    return !!scheduledAtTimestamp.value;
  }
  if (currentStep.value === 4) {
    return hasValidTechnician.value;
  }
  return true;
}

async function handleFinish() {
  if (loading.value) return;
  if (!selectedClientId.value || !selectedClient.value) return;
  const technician = selectedTechnician.value;
  if (!hasValidTechnician.value || !technician) {
    error.value = 'Selecciona un técnico válido antes de crear la orden.';
    currentStep.value = 4;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const unitsPayload = configuredUnits.value.map((u) => {
      const equipments = [u.equipment, u.replacementEquipment]
        .filter((equipment): equipment is ExternalEquipment => Boolean(equipment))
        .map(toEquipmentAssignment);
      return {
        label: u.label.trim(),
        makeModel: u.makeModel.trim(),
        serialNumber: u.serialNumber.trim(),
        year: u.year,
        serviceType: u.serviceType,
        equipment: equipments.length > 0 ? equipments : undefined,
      };
    });

    const primaryService = configuredUnits.value[0]?.serviceType ?? activeServiceType.value;

    const created = await createOrder({
      clientSheetId: selectedClientId.value,
      clientNameSnapshot: selectedClient.value.name,
      serviceType: primaryService,
      scheduledAt: new Date(scheduledAtTimestamp.value).toISOString(),
      isHomeService: isHomeService.value,
      serviceAddress: serviceAddress.value || null,
      generalNotes: generalNotes.value || null,
      technicianId: technician.id,
      units: unitsPayload.length > 0 ? unitsPayload : undefined,
    });

    router.push(`/orders/${created.id}`);
  } catch (err: unknown) {
    error.value = extractApiErrorMessage(err, 'Error al crear la orden de servicio');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <app-layout>
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-xl sm:text-2xl font-bold text-slate-800">Nueva Orden de Servicio</h1>
        <NButton secondary size="small" @click="router.push('/orders')">Cancelar</NButton>
      </div>

      <!-- Desktop Steps Indicator (sm and above) -->
      <NSteps :current="currentStep" class="hidden sm:flex py-4">
        <NStep title="Cliente" description="Selección del cliente" />
        <NStep title="Servicios y Unidades" description="Configuración por bloques" />
        <NStep title="Programación" description="Fecha y ubicación" />
        <NStep title="Técnico" description="Asignación inicial" />
        <NStep title="Revisión" description="Crear orden" />
      </NSteps>

      <!-- Mobile Compact Step Progress (below sm) -->
      <div class="flex sm:hidden flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-blue-900 uppercase tracking-wider">
            Paso {{ currentStep }} de 5
          </span>
          <span class="text-xs font-bold text-slate-700">
            {{
              currentStep === 1
                ? 'Cliente'
                : currentStep === 2
                  ? 'Servicios y Unidades'
                  : currentStep === 3
                    ? 'Programación'
                    : currentStep === 4
                      ? 'Técnico'
                      : 'Revisión y Creación'
            }}
          </span>
        </div>
        <div class="flex gap-1.5">
          <div
            v-for="s in 5"
            :key="s"
            class="h-1.5 flex-1 rounded-full transition-all duration-300"
            :class="s <= currentStep ? 'bg-blue-600' : 'bg-slate-200'"
          />
        </div>
      </div>

      <NAlert v-if="error" type="error" closable class="mb-4" @close="error = null">
        {{ error }}
      </NAlert>

      <!-- Step 1: Cliente -->
      <NCard v-if="currentStep === 1" title="Paso 1: Selección de Cliente">
        <div class="space-y-4">
          <p class="text-xs text-slate-500">
            Selecciona el cliente para el cual se registrará esta orden de servicio. Podrás agregar
            uno o múltiples tipos de servicio en el siguiente paso.
          </p>
          <ClientSelect v-model="selectedClientId" @select="handleClientSelect" />
        </div>
      </NCard>

      <!-- Step 2: Servicios, Unidades y Equipos -->
      <NCard v-if="currentStep === 2" title="Paso 2: Servicios, Unidades y Equipos">
        <div class="space-y-6">
          <!-- Service selector banner -->
          <div class="p-4 border rounded-lg bg-slate-50 space-y-4">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-semibold text-slate-700">
                Seleccionar Tipo de Servicio a Agregar:
              </label>
              <NTag
                v-if="serviceBlocks.some((b) => b.serviceType === activeServiceType)"
                type="info"
                size="small"
              >
                Bloque ya existente (se sumará a él)
              </NTag>
            </div>

            <NSelect
              v-model:value="activeServiceType"
              :options="serviceTypeOptions"
              placeholder="Selecciona el servicio que deseas agregar..."
            />

            <!-- Subform A: Review or Uninstallation -->
            <div
              v-if="activeServiceType === 'REVIEW' || activeServiceType === 'UNINSTALLATION'"
              class="space-y-3 pt-2 border-t"
            >
              <div class="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                <p class="font-semibold mb-0.5">
                  {{
                    activeServiceType === 'REVIEW'
                      ? 'Revisión de Equipos'
                      : 'Desinstalación de Equipos'
                  }}
                </p>
                <p>
                  Selecciona los equipos actualmente instalados para
                  <strong>{{ selectedClient?.name }}</strong
                  >. Los datos de la unidad se autocompletarán desde Google Sheets.
                </p>
              </div>

              <EquipmentSelect
                v-model="reviewSelectedEquipmentKey"
                :service-type="activeServiceType"
                :client-name="selectedClient?.name"
                :exclude-keys="assignedEquipmentKeys"
                @select="handleReviewEquipmentSelect"
              />

              <div
                v-if="reviewSelectedEquipment"
                class="text-xs bg-white p-2.5 rounded border space-y-1"
              >
                <p>
                  <strong>Equipo:</strong> {{ reviewSelectedEquipment.brand }}
                  {{ reviewSelectedEquipment.model }} | <strong>IMEI:</strong>
                  {{ reviewSelectedEquipment.imei || 'N/A' }}
                </p>
                <p>
                  <strong>Unidad en Sheets:</strong>
                  {{ reviewSelectedEquipment.unit || 'Sin registrar' }} ({{
                    reviewSelectedEquipment.unitMakeModel || 'Sin modelo'
                  }}
                  {{ reviewSelectedEquipment.unitYear || '' }}) | <strong>Serie:</strong>
                  {{ reviewSelectedEquipment.unitSerialNumber || 'Sin serie' }}
                </p>
              </div>

              <div class="flex justify-end">
                <NButton
                  type="primary"
                  size="small"
                  :disabled="!reviewSelectedEquipment || !reviewSelectedEquipment.hasValidIdentity"
                  @click="handleAddReviewEquipment(activeServiceType)"
                >
                  + Agregar a {{ ORDER_SERVICE_LABELS[activeServiceType] }}
                </NButton>
              </div>
            </div>

            <!-- Subform B: Equipment Replacement -->
            <div
              v-else-if="activeServiceType === 'EQUIPMENT_REPLACEMENT'"
              class="space-y-4 pt-2 border-t"
            >
              <div
                class="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1"
              >
                <p class="font-semibold">Cambio de Equipo</p>
                <p>
                  1. Selecciona el <strong>equipo actualmente instalado</strong> con el cliente (los
                  datos del vehículo se vinculan automáticamente sin capturarlos).<br />
                  2. Selecciona el <strong>equipo nuevo de almacén</strong> (sin instalar).
                </p>
              </div>

              <!-- 1. Equipo instalado con el cliente -->
              <div class="space-y-2">
                <label class="block text-xs font-bold text-slate-700">
                  1. Equipo Actualmente Instalado (a retirar / cliente: {{ selectedClient?.name }}):
                </label>
                <EquipmentSelect
                  v-model="replacementOldEquipmentKey"
                  service-type="UNINSTALLATION"
                  :client-name="selectedClient?.name"
                  :exclude-keys="excludeKeysForReplacementOld"
                  @select="handleReplacementOldSelect"
                />

                <div
                  v-if="replacementOldEquipment"
                  class="text-xs bg-white p-2.5 rounded border border-slate-200 space-y-1"
                >
                  <p>
                    <strong>Equipo actual:</strong> {{ replacementOldEquipment.brand }}
                    {{ replacementOldEquipment.model }} | <strong>IMEI:</strong>
                    {{ replacementOldEquipment.imei || 'N/A' }}
                  </p>
                  <p class="text-indigo-700 font-medium">
                    <strong>Vehículo vinculado en Sheets:</strong>
                    {{ replacementOldEquipment.unit || 'Sin registrar' }}
                    ({{ replacementOldEquipment.unitMakeModel || 'Sin modelo' }}
                    {{ replacementOldEquipment.unitYear || '' }}) | <strong>Serie:</strong>
                    {{ replacementOldEquipment.unitSerialNumber || 'Sin serie' }}
                  </p>
                </div>
              </div>

              <!-- 2. Equipo nuevo de almacén -->
              <div class="space-y-2 pt-2 border-t border-slate-200">
                <label class="block text-xs font-bold text-slate-700">
                  2. Equipo de Reemplazo (nuevo / sin instalar de almacén):
                </label>
                <EquipmentSelect
                  v-model="replacementNewEquipmentKey"
                  service-type="INSTALLATION"
                  :client-name="selectedClient?.name"
                  :exclude-keys="excludeKeysForReplacementNew"
                  @select="handleReplacementNewSelect"
                />

                <div
                  v-if="replacementNewEquipment"
                  class="text-xs bg-white p-2.5 rounded border border-slate-200 space-y-1"
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

              <div class="flex justify-end pt-2">
                <NButton
                  type="primary"
                  size="small"
                  :disabled="
                    !replacementOldEquipment ||
                    !replacementOldEquipment.hasValidIdentity ||
                    !replacementNewEquipment ||
                    !replacementNewEquipment.hasValidIdentity
                  "
                  @click="handleAddEquipmentReplacement"
                >
                  + Agregar a Cambio de equipo
                </NButton>
              </div>
            </div>

            <!-- Subform C: Installation / Fuel Sensor -->
            <div
              v-else-if="
                activeServiceType === 'INSTALLATION' || activeServiceType === 'FUEL_SENSOR'
              "
              class="space-y-3 pt-2 border-t"
            >
              <div
                class="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800"
              >
                <p class="font-semibold mb-0.5">
                  {{ ORDER_SERVICE_LABELS[activeServiceType] }}
                </p>
                <p>
                  Registra los datos de la unidad vehicular y selecciona el equipo disponible en
                  almacén/stock.
                </p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1"
                    >Económico / Unidad *</label
                  >
                  <NInput
                    v-model:value="unitForm.label"
                    size="small"
                    placeholder="ej. Camión 01, T-12..."
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1"
                    >Marca / Modelo *</label
                  >
                  <NInput
                    v-model:value="unitForm.makeModel"
                    size="small"
                    placeholder="ej. Kenworth T680"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
                  <NInputNumber
                    v-model:value="unitForm.year"
                    size="small"
                    :min="1900"
                    :max="2100"
                    class="w-full"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-600 mb-1"
                    >Número de Serie / VIN *</label
                  >
                  <NInput
                    v-model:value="unitForm.serialNumber"
                    size="small"
                    placeholder="ej. 3AKJH567..."
                  />
                </div>
              </div>

              <div>
                <EquipmentSelect
                  v-model="installationEquipmentKey"
                  :service-type="activeServiceType"
                  :client-name="selectedClient?.name"
                  :exclude-keys="assignedEquipmentKeys"
                  @select="handleInstallationEquipmentSelect"
                />
              </div>

              <div class="flex justify-end">
                <NButton
                  type="primary"
                  size="small"
                  :disabled="
                    !unitForm.label.trim() ||
                    !unitForm.makeModel.trim() ||
                    !unitForm.serialNumber.trim() ||
                    Boolean(
                      installationEquipmentKey &&
                      (!installationEquipment || !installationEquipment.hasValidIdentity),
                    )
                  "
                  @click="handleAddManualUnit(activeServiceType)"
                >
                  + Agregar a {{ ORDER_SERVICE_LABELS[activeServiceType] }}
                </NButton>
              </div>
            </div>
          </div>

          <!-- Grouped Service Blocks Display -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-bold text-slate-800">
                Bloques de Servicio en la Orden ({{ configuredUnits.length }} unidades en total)
              </h3>
              <span v-if="serviceBlocks.length > 1" class="text-xs text-indigo-600 font-medium">
                {{ serviceBlocks.length }} servicios diferentes configurados
              </span>
            </div>

            <NEmpty
              v-if="configuredUnits.length === 0"
              description="Aún no has agregado unidades a la orden. Selecciona un servicio arriba para agregar la primera."
            />

            <div v-else class="space-y-4">
              <div
                v-for="block in serviceBlocks"
                :key="block.serviceType"
                class="border-2 rounded-lg bg-white overflow-hidden shadow-sm"
                :class="
                  block.serviceType === activeServiceType
                    ? 'border-indigo-400 ring-1 ring-indigo-200'
                    : 'border-slate-200'
                "
              >
                <!-- Block header -->
                <div
                  class="bg-slate-50 px-4 py-2.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div class="flex items-center gap-2">
                    <NTag
                      :type="
                        block.serviceType === 'INSTALLATION'
                          ? 'success'
                          : block.serviceType === 'REVIEW'
                            ? 'info'
                            : block.serviceType === 'UNINSTALLATION'
                              ? 'warning'
                              : 'default'
                      "
                      size="small"
                      round
                    >
                      {{ block.label }}
                    </NTag>
                    <span class="text-xs font-semibold text-slate-600">
                      ({{ block.units.length }}
                      {{ block.units.length === 1 ? 'unidad' : 'unidades' }})
                    </span>
                  </div>

                  <div class="flex items-center gap-2 flex-wrap">
                    <NButton
                      size="tiny"
                      secondary
                      type="primary"
                      @click="selectServiceBlockForAdding(block.serviceType)"
                    >
                      + Agregar unidad
                    </NButton>
                    <NButton
                      size="tiny"
                      quaternary
                      type="error"
                      @click="removeBlock(block.serviceType)"
                    >
                      Eliminar bloque
                    </NButton>
                  </div>
                </div>

                <!-- Units inside this service block -->
                <div class="p-3 space-y-2">
                  <div
                    v-for="(unit, idx) in block.units"
                    :key="unit.id"
                    class="p-3 border rounded bg-slate-50 flex items-center justify-between gap-3 text-xs"
                  >
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <NTag size="tiny" :bordered="false">#{{ idx + 1 }}</NTag>
                        <span class="font-bold text-slate-800">{{ unit.label }}</span>
                        <span class="text-slate-500">
                          ({{ unit.makeModel }} {{ unit.year || '' }} — Serie:
                          {{ unit.serialNumber }})
                        </span>
                      </div>
                      <div v-if="unit.serviceType === 'EQUIPMENT_REPLACEMENT'" class="space-y-0.5">
                        <p v-if="unit.equipment" class="text-amber-800">
                          <strong>A retirar:</strong> {{ unit.equipment.brand }}
                          {{ unit.equipment.model }}
                          <span class="text-slate-500 font-mono"
                            >| IMEI: {{ unit.equipment.imei || 'N/A' }}</span
                          >
                        </p>
                        <p v-if="unit.replacementEquipment" class="text-emerald-800">
                          <strong>Reemplazo:</strong> {{ unit.replacementEquipment.brand }}
                          {{ unit.replacementEquipment.model }}
                          <span class="text-slate-500 font-mono"
                            >| IMEI: {{ unit.replacementEquipment.imei || 'N/A' }}</span
                          >
                        </p>
                      </div>
                      <p v-else-if="unit.equipment" class="text-slate-600">
                        <strong>Equipo:</strong> {{ unit.equipment.brand }}
                        {{ unit.equipment.model }}
                        <span class="text-slate-400">
                          | ID: {{ unit.equipment.id || 'N/A' }} | IMEI:
                          {{ unit.equipment.imei || 'N/A' }}
                        </span>
                      </p>
                    </div>

                    <NButton
                      size="tiny"
                      quaternary
                      type="error"
                      @click="removeConfiguredUnit(unit.id)"
                    >
                      Quitar
                    </NButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </NCard>

      <!-- Step 3: Programación -->
      <NCard v-if="currentStep === 3" title="Paso 3: Detalles de la Cita">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1"
              >Fecha y Hora Programada</label
            >
            <NDatePicker v-model:value="scheduledAtTimestamp" type="datetime" class="w-full" />
          </div>

          <div class="flex items-center gap-3">
            <NSwitch v-model:value="isHomeService" />
            <span class="text-sm text-slate-700 font-medium"
              >¿Servicio a domicilio / en sitio?</span
            >
          </div>

          <div v-if="isHomeService">
            <label class="block text-sm font-medium text-slate-700 mb-1"
              >Dirección del Servicio</label
            >
            <NInput
              v-model:value="serviceAddress"
              placeholder="Calle, número, colonia, CP, ciudad..."
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1"
              >Notas Generales / Instrucciones</label
            >
            <NInput
              v-model:value="generalNotes"
              type="textarea"
              rows="3"
              placeholder="Indicaciones para el técnico o sobre la flotilla..."
            />
          </div>
        </div>
      </NCard>

      <!-- Step 4: Técnico -->
      <NCard v-if="currentStep === 4" title="Paso 4: Técnico Asignado">
        <TechnicianSelect
          v-model="technicianId"
          :disabled="loading"
          @select="handleTechnicianSelect"
        />
      </NCard>

      <!-- Step 5: Resumen y Confirmación -->
      <NCard v-if="currentStep === 5" title="Paso 5: Resumen y Confirmación">
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block">Cliente:</span>
            <span class="font-bold text-slate-800"
              >{{ selectedClient?.name }} ({{ selectedClientId }})</span
            >
          </div>

          <!-- Grouped services summary -->
          <div class="p-3 bg-slate-50 rounded space-y-2">
            <span class="text-slate-500 block"
              >Bloques de Servicio ({{ serviceBlocks.length }}):</span
            >
            <div v-if="serviceBlocks.length === 0" class="text-slate-400 italic text-xs">
              Sin unidades registradas
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="block in serviceBlocks"
                :key="block.serviceType"
                class="p-2.5 bg-white border rounded space-y-1.5"
              >
                <div class="flex items-center gap-2">
                  <NTag size="small" type="info">{{ block.label }}</NTag>
                  <span class="text-xs text-slate-600 font-semibold">
                    {{ block.units.length }} {{ block.units.length === 1 ? 'unidad' : 'unidades' }}
                  </span>
                </div>
                <ul class="space-y-1 text-xs pl-2 text-slate-700">
                  <li v-for="(u, idx) in block.units" :key="u.id">
                    <strong>#{{ idx + 1 }} {{ u.label }}:</strong> {{ u.makeModel }}
                    {{ u.year || '' }} (Serie: {{ u.serialNumber }})
                    <template v-if="u.serviceType === 'EQUIPMENT_REPLACEMENT'">
                      <span v-if="u.equipment" class="text-amber-700 block text-[11px]">
                        • A retirar: {{ u.equipment.brand }} {{ u.equipment.model }} [IMEI:
                        {{ u.equipment.imei || 'N/A' }}]
                      </span>
                      <span
                        v-if="u.replacementEquipment"
                        class="text-emerald-700 block text-[11px]"
                      >
                        • Reemplazo: {{ u.replacementEquipment.brand }}
                        {{ u.replacementEquipment.model }} [IMEI:
                        {{ u.replacementEquipment.imei || 'N/A' }}]
                      </span>
                    </template>
                    <span v-else-if="u.equipment" class="text-indigo-600">
                      — Equipo: {{ u.equipment.brand }} {{ u.equipment.model }} [ID:
                      {{ u.equipment.id || 'N/A' }}] [IMEI: {{ u.equipment.imei || 'N/A' }}]
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block">Programado para:</span>
            <span class="font-semibold text-slate-800">{{
              new Date(scheduledAtTimestamp).toLocaleString()
            }}</span>
            <span class="text-xs text-slate-500 block mt-0.5">
              Modalidad: {{ isHomeService ? 'A domicilio / en sitio' : 'En taller' }}
              {{ serviceAddress ? `(${serviceAddress})` : '' }}
            </span>
          </div>

          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block">Técnico Asignado:</span>
            <span class="font-semibold text-slate-800">
              {{ selectedTechnician?.name }}
            </span>
          </div>
        </div>
      </NCard>

      <!-- Navigation buttons -->
      <div class="flex items-center justify-between gap-3 pt-2">
        <NButton
          :disabled="currentStep === 1 || loading"
          class="min-w-24 sm:min-w-28"
          @click="currentStep--"
        >
          Anterior
        </NButton>

        <NButton
          v-if="currentStep < 5"
          type="primary"
          class="min-w-24 sm:min-w-28"
          :disabled="!canProceed() || loading"
          @click="currentStep++"
        >
          Siguiente
        </NButton>

        <NButton
          v-else
          type="primary"
          class="flex-1 sm:flex-initial"
          :loading="loading"
          :disabled="!hasValidTechnician"
          @click="handleFinish"
        >
          Crear Orden de Servicio
        </NButton>
      </div>
    </div>
  </app-layout>
</template>
