<script setup lang="ts">
import { ref, onMounted } from 'vue';
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
import type { ExternalClient, ExternalEquipment } from '@puk/contracts';
import {
  ClientSelect,
  EquipmentSelect,
  extractUnitFromEquipment,
} from '../../external-catalogs/index.js';
import { api } from '../../../shared/http/client.js';
import { createOrder } from '../api.js';
import { formatServiceType } from '../formatters.js';
import AppLayout from '@/shared/layouts/AppLayout.vue';

const router = useRouter();

const currentStep = ref(1);
const loading = ref(false);
const error = ref<string | null>(null);

// Step 1: Client & Service Type
const selectedClientId = ref<string | null>(null);
const selectedClient = ref<ExternalClient | null>(null);
const serviceType = ref<'INSTALLATION' | 'REVIEW' | 'UNINSTALLATION' | 'FAILED_APPOINTMENT'>(
  'INSTALLATION',
);

const serviceTypeOptions = [
  { label: 'Instalación', value: 'INSTALLATION' },
  { label: 'Revisión', value: 'REVIEW' },
  { label: 'Desinstalación', value: 'UNINSTALLATION' },
  { label: 'Cita Fallida', value: 'FAILED_APPOINTMENT' },
];

function handleClientSelect(client: ExternalClient | null) {
  if (selectedClient.value?.id !== client?.id) {
    configuredUnits.value = [];
  }
  selectedClient.value = client;
}

function handleServiceTypeChange(
  val: 'INSTALLATION' | 'REVIEW' | 'UNINSTALLATION' | 'FAILED_APPOINTMENT',
) {
  if (serviceType.value !== val) {
    configuredUnits.value = [];
    serviceType.value = val;
  }
}

// Step 2: Units & Equipment
export interface ConfiguredUnitItem {
  id: string;
  label: string;
  makeModel: string;
  serialNumber: string;
  year: number | null;
  equipment: ExternalEquipment | null;
}

const configuredUnits = ref<ConfiguredUnitItem[]>([]);

// For Review / Uninstallation selection:
const reviewSelectedEquipmentKey = ref<string | null>(null);
const reviewSelectedEquipment = ref<ExternalEquipment | null>(null);

function handleReviewEquipmentSelect(eq: ExternalEquipment | null) {
  reviewSelectedEquipment.value = eq;
}

function handleAddReviewEquipment() {
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
    label: extracted.label,
    makeModel: extracted.makeModel,
    serialNumber: extracted.serialNumber,
    year: extracted.year,
    equipment: eq,
  });

  reviewSelectedEquipmentKey.value = null;
  reviewSelectedEquipment.value = null;
}

// For Installation form:
const newUnitForm = ref({
  label: '',
  makeModel: '',
  serialNumber: '',
  year: new Date().getFullYear(),
});
const installationEquipmentKey = ref<string | null>(null);
const installationEquipment = ref<ExternalEquipment | null>(null);

function handleInstallationEquipmentSelect(eq: ExternalEquipment | null) {
  installationEquipment.value = eq;
}

function handleAddInstallationUnit() {
  const { label, makeModel, serialNumber, year } = newUnitForm.value;
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
    label: label.trim(),
    makeModel: makeModel.trim(),
    serialNumber: serialNumber.trim(),
    year: typeof year === 'number' && year >= 1900 && year <= 2100 ? year : null,
    equipment: installationEquipment.value,
  });

  newUnitForm.value = {
    label: '',
    makeModel: '',
    serialNumber: '',
    year: new Date().getFullYear(),
  };
  installationEquipmentKey.value = null;
  installationEquipment.value = null;
}

function removeConfiguredUnit(index: number) {
  configuredUnits.value.splice(index, 1);
}

// Step 3: Schedule & Details
const scheduledAtTimestamp = ref<number>(Date.now() + 86400000);
const isHomeService = ref(false);
const serviceAddress = ref('');
const generalNotes = ref('');

// Step 4: Technician
const technicianId = ref<string | null>(null);
const technicians = ref<Array<{ id: string; name: string }>>([]);

async function loadTechnicians() {
  try {
    const res = await api.get('/technicians');
    technicians.value = res.data.data.filter(
      (t: { active?: boolean; id: string; name: string }) => t.active,
    );
  } catch {
    // ignore technician load failure gracefully
  }
}

function canProceed(): boolean {
  if (currentStep.value === 1) {
    return !!selectedClientId.value && !!serviceType.value;
  }
  if (currentStep.value === 2) {
    if (serviceType.value === 'FAILED_APPOINTMENT') {
      return true;
    }
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
  return true;
}

async function handleFinish() {
  if (!selectedClientId.value || !selectedClient.value) return;

  loading.value = true;
  error.value = null;

  try {
    const unitsPayload = configuredUnits.value.map((u) => ({
      label: u.label.trim(),
      makeModel: u.makeModel.trim(),
      serialNumber: u.serialNumber.trim(),
      year: u.year,
      equipment: u.equipment
        ? [
            {
              externalKey: u.equipment.externalKey,
              externalId: u.equipment.id,
              imei: u.equipment.imei,
              sheetName: 'SALIDAS',
              sheetRowHint: u.equipment.rowNumber,
              brandSnapshot: u.equipment.brand,
              modelSnapshot: u.equipment.model,
              lineSnapshot: u.equipment.line,
              iccidSnapshot: u.equipment.iccid,
              carrierSnapshot: u.equipment.carrier,
              equipmentConditionSnapshot: u.equipment.condition,
              serviceStatusSnapshot: u.equipment.serviceStatus,
              rawSnapshot: u.equipment.rawValues,
            },
          ]
        : [],
    }));

    const created = await createOrder({
      clientSheetId: selectedClientId.value,
      clientNameSnapshot: selectedClient.value.name,
      serviceType: serviceType.value,
      scheduledAt: new Date(scheduledAtTimestamp.value).toISOString(),
      isHomeService: isHomeService.value,
      serviceAddress: serviceAddress.value || null,
      generalNotes: generalNotes.value || null,
      technicianId: technicianId.value || null,
      units: unitsPayload.length > 0 ? unitsPayload : undefined,
    });

    router.push(`/orders/${created.id}`);
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
            ?.message
        : undefined;
    error.value = message || 'Error al crear la orden de servicio';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadTechnicians();
});
</script>

<template>
  <app-layout>
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-800">Nueva Orden de Servicio</h1>
        <NButton secondary @click="router.push('/orders')">Cancelar</NButton>
      </div>

      <NSteps :current="currentStep" class="py-4">
        <NStep title="Cliente y Servicio" description="Catálogo y tipo" />
        <NStep title="Unidades y Equipos" description="Configuración inicial" />
        <NStep title="Programación" description="Fecha y ubicación" />
        <NStep title="Técnico" description="Asignación inicial" />
        <NStep title="Revisión" description="Crear orden" />
      </NSteps>

      <NAlert v-if="error" type="error" closable class="mb-4" @close="error = null">
        {{ error }}
      </NAlert>

      <!-- Step 1: Cliente y Servicio -->
      <NCard v-if="currentStep === 1" title="Paso 1: Selección de Cliente y Tipo de Servicio">
        <div class="space-y-4">
          <ClientSelect v-model="selectedClientId" @select="handleClientSelect" />

          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Tipo de Servicio</label>
            <NSelect
              :value="serviceType"
              :options="serviceTypeOptions"
              @update:value="handleServiceTypeChange"
            />
          </div>
        </div>
      </NCard>

      <!-- Step 2: Unidades y Equipos -->
      <NCard v-if="currentStep === 2" title="Paso 2: Unidades y Equipos">
        <!-- Case A: Review or Uninstallation -->
        <div v-if="serviceType === 'REVIEW' || serviceType === 'UNINSTALLATION'" class="space-y-6">
          <div class="p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
            <p class="font-semibold mb-1">
              {{ serviceType === 'REVIEW' ? 'Revisión de Equipos' : 'Desinstalación de Equipos' }}
            </p>
            <p>
              Selecciona los equipos actualmente instalados para
              <strong>{{ selectedClient?.name }}</strong
              >. Los datos de la unidad se autocompletarán automáticamente desde Google Sheets.
            </p>
          </div>

          <div class="p-4 border rounded-lg bg-slate-50 space-y-3">
            <h4 class="text-sm font-semibold text-slate-700">Agregar Equipo Instalado</h4>
            <EquipmentSelect
              v-model="reviewSelectedEquipmentKey"
              :service-type="serviceType"
              :client-name="selectedClient?.name"
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

            <NButton
              type="primary"
              size="small"
              :disabled="!reviewSelectedEquipment || !reviewSelectedEquipment.hasValidIdentity"
              @click="handleAddReviewEquipment"
            >
              + Agregar Equipo a la Orden
            </NButton>
          </div>

          <!-- Configured units list -->
          <div>
            <h4 class="text-sm font-semibold text-slate-800 mb-2">
              Unidades y Equipos en la Orden ({{ configuredUnits.length }})
            </h4>

            <NEmpty
              v-if="configuredUnits.length === 0"
              description="Aún no has agregado equipos a la orden. Selecciona un equipo arriba para agregarlo."
            />

            <div v-else class="space-y-3">
              <div
                v-for="(unit, idx) in configuredUnits"
                :key="unit.id"
                class="p-4 border rounded-lg bg-white shadow-sm space-y-3"
              >
                <div class="flex items-center justify-between border-b pb-2">
                  <div class="flex items-center gap-2">
                    <NTag type="info" size="small">#{{ idx + 1 }}</NTag>
                    <span class="font-bold text-sm text-slate-800">
                      {{ unit.equipment?.brand }} {{ unit.equipment?.model }}
                    </span>
                    <span class="text-xs text-slate-500">
                      (ID: {{ unit.equipment?.id || 'N/A' }} | IMEI:
                      {{ unit.equipment?.imei || 'N/A' }})
                    </span>
                  </div>
                  <NButton size="tiny" quaternary type="error" @click="removeConfiguredUnit(idx)">
                    Quitar
                  </NButton>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1"
                      >Económico / Unidad *</label
                    >
                    <NInput v-model:value="unit.label" size="small" placeholder="ej. Eco-101" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1"
                      >Marca / Modelo *</label
                    >
                    <NInput
                      v-model:value="unit.makeModel"
                      size="small"
                      placeholder="ej. Kenworth T680"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
                    <NInputNumber
                      v-model:value="unit.year"
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
                      v-model:value="unit.serialNumber"
                      size="small"
                      placeholder="ej. 3AKJH567..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Case B: Installation -->
        <div v-else-if="serviceType === 'INSTALLATION'" class="space-y-6">
          <div
            class="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800"
          >
            <p class="font-semibold mb-1">Nueva Instalación</p>
            <p>
              Registra los datos de la unidad a equipar y selecciona el equipo disponible en
              almacén/stock.
            </p>
          </div>

          <div class="p-4 border rounded-lg bg-slate-50 space-y-4">
            <h4 class="text-sm font-semibold text-slate-700">Registrar Unidad y Asignar Equipo</h4>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1"
                  >Económico / Unidad *</label
                >
                <NInput v-model:value="newUnitForm.label" placeholder="ej. Eco-101" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1"
                  >Marca / Modelo *</label
                >
                <NInput v-model:value="newUnitForm.makeModel" placeholder="ej. Kenworth T680" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Año</label>
                <NInputNumber
                  v-model:value="newUnitForm.year"
                  :min="1900"
                  :max="2100"
                  class="w-full"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1"
                  >Número de Serie / VIN *</label
                >
                <NInput v-model:value="newUnitForm.serialNumber" placeholder="ej. 3AKJH567..." />
              </div>
            </div>

            <div>
              <EquipmentSelect
                v-model="installationEquipmentKey"
                :service-type="'INSTALLATION'"
                :client-name="selectedClient?.name"
                @select="handleInstallationEquipmentSelect"
              />
            </div>

            <NButton
              type="primary"
              size="small"
              :disabled="
                !newUnitForm.label.trim() ||
                !newUnitForm.makeModel.trim() ||
                !newUnitForm.serialNumber.trim() ||
                !installationEquipment ||
                !installationEquipment.hasValidIdentity
              "
              @click="handleAddInstallationUnit"
            >
              + Agregar Unidad a la Orden
            </NButton>
          </div>

          <!-- Configured installation units list -->
          <div>
            <h4 class="text-sm font-semibold text-slate-800 mb-2">
              Unidades a Instalar ({{ configuredUnits.length }})
            </h4>

            <NEmpty
              v-if="configuredUnits.length === 0"
              description="Aún no has agregado unidades. Completa el formulario arriba para agregar una."
            />

            <div v-else class="space-y-3">
              <div
                v-for="(unit, idx) in configuredUnits"
                :key="unit.id"
                class="p-4 border rounded-lg bg-white shadow-sm flex items-center justify-between"
              >
                <div>
                  <div class="flex items-center gap-2">
                    <NTag type="success" size="small">#{{ idx + 1 }}</NTag>
                    <span class="font-bold text-sm text-slate-800">{{ unit.label }}</span>
                    <span class="text-xs text-slate-500">
                      ({{ unit.makeModel }} {{ unit.year || '' }} - Serie: {{ unit.serialNumber }})
                    </span>
                  </div>
                  <p class="text-xs text-slate-600 mt-1">
                    <strong>Equipo:</strong> {{ unit.equipment?.brand }}
                    {{ unit.equipment?.model }} (ID: {{ unit.equipment?.id || 'N/A' }} | IMEI:
                    {{ unit.equipment?.imei || 'N/A' }})
                  </p>
                </div>
                <NButton size="tiny" quaternary type="error" @click="removeConfiguredUnit(idx)">
                  Quitar
                </NButton>
              </div>
            </div>
          </div>
        </div>

        <!-- Case C: Failed appointment -->
        <div v-else class="p-4 text-center text-slate-500 text-sm space-y-2">
          <p>Para citas fallidas, la asignación de unidades y equipos es opcional.</p>
          <p class="text-xs text-slate-400">Puedes continuar al siguiente paso directamente.</p>
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
        <div class="space-y-4">
          <label class="block text-sm font-medium text-slate-700 mb-1"
            >Seleccionar Técnico (Opcional en borrador)</label
          >
          <NSelect
            v-model:value="technicianId"
            :options="
              technicians.map((t) => ({
                label: t.name,
                value: t.id,
              }))
            "
            clearable
            placeholder="Seleccionar técnico..."
          />
          <p class="text-xs text-slate-500">
            Nota: Puede dejarse vacío en borrador, pero será obligatorio antes de confirmar la
            asignación y sincronizar a Sheets.
          </p>
        </div>
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
          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block">Tipo de Servicio:</span>
            <span class="font-semibold text-slate-800">{{ formatServiceType(serviceType) }}</span>
          </div>
          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block"
              >Unidades y Equipos ({{ configuredUnits.length }}):</span
            >
            <div v-if="configuredUnits.length === 0" class="text-slate-400 italic text-xs mt-1">
              Sin unidades registradas
            </div>
            <ul v-else class="mt-1 space-y-1 text-xs">
              <li v-for="(u, idx) in configuredUnits" :key="u.id" class="text-slate-700">
                <strong>#{{ idx + 1 }} {{ u.label }}:</strong> {{ u.makeModel }}
                {{ u.year || '' }} (Serie: {{ u.serialNumber }})
                <span v-if="u.equipment" class="text-indigo-600">
                  — Equipo: {{ u.equipment.brand }} {{ u.equipment.model }} [ID:
                  {{ u.equipment.id || 'N/A' }}] [IMEI: {{ u.equipment.imei || 'N/A' }}]
                </span>
              </li>
            </ul>
          </div>
          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block">Programado para:</span>
            <span class="font-semibold text-slate-800">{{
              new Date(scheduledAtTimestamp).toLocaleString()
            }}</span>
          </div>
          <div class="p-3 bg-slate-50 rounded">
            <span class="text-slate-500 block">Técnico:</span>
            <span class="font-semibold text-slate-800">
              {{ technicians.find((t) => t.id === technicianId)?.name || 'Sin asignar (Borrador)' }}
            </span>
          </div>
        </div>
      </NCard>

      <!-- Navigation buttons -->
      <div class="flex justify-between">
        <NButton :disabled="currentStep === 1 || loading" @click="currentStep--">
          ← Anterior
        </NButton>

        <NButton
          v-if="currentStep < 5"
          type="primary"
          :disabled="!canProceed() || loading"
          @click="currentStep++"
        >
          Siguiente →
        </NButton>

        <NButton v-else type="primary" :loading="loading" @click="handleFinish">
          Crear Orden de Servicio
        </NButton>
      </div>
    </div>
  </app-layout>
</template>
