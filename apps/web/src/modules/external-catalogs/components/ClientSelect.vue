<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NSelect, NButton, NAlert } from 'naive-ui';
import type { ExternalClient } from '@puk/contracts';
import { fetchClients, refreshCatalogs } from '../api.js';

const props = defineProps<{
  modelValue?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'select', client: ExternalClient | null): void;
}>();

const clients = ref<ExternalClient[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const fetchedAt = ref<string | null>(null);
const sheetsAvailable = ref(true);

async function loadClients(force = false) {
  loading.value = true;
  error.value = null;
  try {
    if (force) {
      await refreshCatalogs();
    }
    const res = await fetchClients();
    clients.value = res.clients;
    fetchedAt.value = res.fetchedAt;
    sheetsAvailable.value = res.sheetsAvailable;
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
            ?.message
        : undefined;
    error.value = message || 'Error al cargar el catálogo de clientes';
  } finally {
    loading.value = false;
  }
}

function handleUpdate(value: string | null) {
  emit('update:modelValue', value);
  const selected = clients.value.find((c) => c.id === value) || null;
  emit('select', selected);
}

onMounted(() => {
  loadClients();
});
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
      <label class="text-sm font-medium text-slate-700">Cliente</label>
      <div v-if="fetchedAt" class="text-xs text-slate-500">
        Obtenido: {{ new Date(fetchedAt).toLocaleTimeString() }}
        <button
          type="button"
          class="ml-2 text-indigo-600 hover:underline text-xs"
          :disabled="loading || props.disabled"
          @click="loadClients(true)"
        >
          Recargar
        </button>
      </div>
    </div>

    <NAlert v-if="error" type="error" closable class="mb-2">
      <div class="flex items-center justify-between">
        <span>{{ error }}</span>
        <NButton size="tiny" secondary @click="loadClients()">Reintentar</NButton>
      </div>
    </NAlert>

    <p v-if="!sheetsAvailable && !error" role="status" class="text-xs text-slate-500">
      Google Sheets no está disponible por el momento. Solo se muestran clientes guardados en el
      sistema.
    </p>

    <NSelect
      :value="props.modelValue ?? null"
      :options="
        clients.map((c) => ({
          label: `${c.name} (${c.id})`,
          value: c.id,
        }))
      "
      :loading="loading"
      :disabled="props.disabled || loading"
      filterable
      placeholder="Buscar y seleccionar cliente..."
      clearable
      @update:value="handleUpdate"
    />
  </div>
</template>
