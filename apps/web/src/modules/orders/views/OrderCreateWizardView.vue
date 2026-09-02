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
  NSwitch,
  NAlert,
  NDatePicker,
} from 'naive-ui';
import type { ExternalClient } from '@puk/contracts';
import { ClientSelect } from '../../external-catalogs/index.js';
import { api } from '../../../shared/http/client.js';
import { createOrder } from '../api.js';

const router = useRouter();

const currentStep = ref(1);
const loading = ref(false);
const error = ref<string | null>(null);

// Step 1: Client & Service Type
const selectedClientId = ref<string | null>(null);
const selectedClient = ref<ExternalClient | null>(null);
const serviceType = ref<'INSTALLATION' | 'REVIEW' | 'UNINSTALLATION' | 'FAILED_APPOINTMENT'>('INSTALLATION');

const serviceTypeOptions = [
  { label: 'Instalación', value: 'INSTALLATION' },
  { label: 'Revisión', value: 'REVIEW' },
  { label: 'Desinstalación', value: 'UNINSTALLATION' },
  { label: 'Cita Fallida', value: 'FAILED_APPOINTMENT' },
];

// Step 2: Schedule & Details
const scheduledAtTimestamp = ref<number>(Date.now() + 86400000);
const isHomeService = ref(false);
const serviceAddress = ref('');
const generalNotes = ref('');

// Step 3: Technician
const technicianId = ref<string | null>(null);
const technicians = ref<Array<{ id: string; name: string }>>([]);

async function loadTechnicians() {
  try {
    const res = await api.get('/technicians');
    technicians.value = res.data.data.filter((t: { active?: boolean; id: string; name: string }) => t.active);
  } catch {
    // ignore technician load failure gracefully
  }
}

function handleClientSelect(client: ExternalClient | null) {
  selectedClient.value = client;
}

function canProceed(): boolean {
  if (currentStep.value === 1) {
    return !!selectedClientId.value && !!serviceType.value;
  }
  if (currentStep.value === 2) {
    return !!scheduledAtTimestamp.value;
  }
  return true;
}

async function handleFinish() {
  if (!selectedClientId.value || !selectedClient.value) return;

  loading.value = true;
  error.value = null;

  try {
    const created = await createOrder({
      clientSheetId: selectedClientId.value,
      clientNameSnapshot: selectedClient.value.name,
      serviceType: serviceType.value,
      scheduledAt: new Date(scheduledAtTimestamp.value).toISOString(),
      isHomeService: isHomeService.value,
      serviceAddress: serviceAddress.value || null,
      generalNotes: generalNotes.value || null,
      technicianId: technicianId.value || null,
    });

    router.push(`/orders/${created.id}`);
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
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
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-slate-800">Nueva Orden de Servicio</h1>
      <NButton secondary @click="router.push('/orders')">Cancelar</NButton>
    </div>

    <NSteps :current="currentStep" class="py-4">
      <NStep title="Cliente y Servicio" description="Catálogo y tipo" />
      <NStep title="Programación" description="Fecha y ubicación" />
      <NStep title="Técnico" description="Asignación inicial" />
      <NStep title="Revisión" description="Crear borrador" />
    </NSteps>

    <NAlert v-if="error" type="error" closable class="mb-4">
      {{ error }}
    </NAlert>

    <!-- Step 1 -->
    <NCard v-if="currentStep === 1" title="Paso 1: Selección de Cliente y Tipo de Servicio">
      <div class="space-y-4">
        <ClientSelect
          v-model="selectedClientId"
          @select="handleClientSelect"
        />

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Tipo de Servicio</label>
          <NSelect v-model:value="serviceType" :options="serviceTypeOptions" />
        </div>
      </div>
    </NCard>

    <!-- Step 2 -->
    <NCard v-if="currentStep === 2" title="Paso 2: Detalles de la Cita">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Fecha y Hora Programada</label>
          <NDatePicker
            v-model:value="scheduledAtTimestamp"
            type="datetime"
            class="w-full"
          />
        </div>

        <div class="flex items-center gap-3">
          <NSwitch v-model:value="isHomeService" />
          <span class="text-sm text-slate-700 font-medium">¿Servicio a domicilio / en sitio?</span>
        </div>

        <div v-if="isHomeService">
          <label class="block text-sm font-medium text-slate-700 mb-1">Dirección del Servicio</label>
          <NInput v-model:value="serviceAddress" placeholder="Calle, número, colonia, CP, ciudad..." />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Notas Generales / Instrucciones</label>
          <NInput
            v-model:value="generalNotes"
            type="textarea"
            rows="3"
            placeholder="Indicaciones para el técnico o sobre la flotilla..."
          />
        </div>
      </div>
    </NCard>

    <!-- Step 3 -->
    <NCard v-if="currentStep === 3" title="Paso 3: Técnico Asignado">
      <div class="space-y-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Seleccionar Técnico (Opcional en borrador)</label>
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
          Nota: Puede dejarse vacío en borrador, pero será obligatorio antes de confirmar la asignación y sincronizar a Sheets.
        </p>
      </div>
    </NCard>

    <!-- Step 4 -->
    <NCard v-if="currentStep === 4" title="Paso 4: Resumen y Confirmación">
      <div class="space-y-3 text-sm">
        <div class="p-3 bg-slate-50 rounded">
          <span class="text-slate-500 block">Cliente:</span>
          <span class="font-bold text-slate-800">{{ selectedClient?.name }} ({{ selectedClientId }})</span>
        </div>
        <div class="p-3 bg-slate-50 rounded">
          <span class="text-slate-500 block">Tipo de Servicio:</span>
          <span class="font-semibold text-slate-800">{{ serviceType }}</span>
        </div>
        <div class="p-3 bg-slate-50 rounded">
          <span class="text-slate-500 block">Programado para:</span>
          <span class="font-semibold text-slate-800">{{ new Date(scheduledAtTimestamp).toLocaleString() }}</span>
        </div>
        <div class="p-3 bg-slate-50 rounded">
          <span class="text-slate-500 block">Técnico:</span>
          <span class="font-semibold text-slate-800">
            {{ technicians.find((t) => t.id === technicianId)?.name || 'Sin asignar (Borrador)' }}
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-2">
          Al crear la orden, pasará al estado <strong>Borrador (DRAFT)</strong> donde podrás registrar las unidades y asignar los equipos de Google Sheets antes de la asignación definitiva.
        </p>
      </div>
    </NCard>

    <!-- Navigation buttons -->
    <div class="flex justify-between">
      <NButton :disabled="currentStep === 1 || loading" @click="currentStep--">
        ← Anterior
      </NButton>

      <NButton
        v-if="currentStep < 4"
        type="primary"
        :disabled="!canProceed() || loading"
        @click="currentStep++"
      >
        Siguiente →
      </NButton>

      <NButton
        v-else
        type="primary"
        :loading="loading"
        @click="handleFinish"
      >
        Crear Orden en Borrador
      </NButton>
    </div>
  </div>
</template>
