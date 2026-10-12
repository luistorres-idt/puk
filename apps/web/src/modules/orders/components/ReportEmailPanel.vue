<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
} from 'naive-ui';
import { useReportEmail } from '../useReportEmail.js';
const props = defineProps<{ orderId: string; reportId: string; version: number }>();
const targetOrderId = ref(props.orderId);
const targetReportId = ref(props.reportId);
const targetVersion = ref(props.version);
const {
  client,
  configured,
  selectedIds,
  loading,
  adding,
  sending,
  error,
  result,
  load,
  addEmail,
  send,
} = useReportEmail(targetOrderId, targetReportId);
const open = ref(false);
const email = ref('');
const options = computed(
  () => client.value?.emails.map((item) => ({ label: item.email, value: item.id })) ?? [],
);
const selectedEmails = computed(() =>
  options.value.filter((item) => selectedIds.value.includes(item.value)).map((item) => item.label),
);
const sentCount = computed(
  () => result.value?.results.filter((item) => item.status === 'SENT').length ?? 0,
);
const failedCount = computed(
  () => result.value?.results.filter((item) => item.status === 'FAILED').length ?? 0,
);
async function show(): Promise<void> {
  targetOrderId.value = props.orderId;
  targetReportId.value = props.reportId;
  targetVersion.value = props.version;
  open.value = true;
  email.value = '';
  await load();
}
async function add(): Promise<void> {
  if (await addEmail(email.value)) email.value = '';
}
watch(
  () => [props.orderId, props.reportId],
  () => {
    if (!sending.value) {
      open.value = false;
      result.value = null;
      selectedIds.value = [];
    }
  },
);
</script>
<template>
  <n-button size="small" secondary @click="show">Enviar reporte</n-button>
  <n-modal
    v-model:show="open"
    preset="card"
    title="Enviar reporte por correo"
    class="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto"
    :closable="!sending"
    :mask-closable="!sending"
    :close-on-esc="!sending"
  >
    <p class="mb-4 text-sm">
      Se adjuntará el PDF de la versión {{ targetVersion }}. Cada destinatario recibe un mensaje
      individual.
    </p>
    <n-alert v-if="error" class="mb-4" type="error">{{ error }}</n-alert>
    <n-spin :show="loading">
      <n-alert v-if="!loading && !configured" class="mb-4" type="warning"
        >El envío por Gmail no está configurado.</n-alert
      >
      <div v-if="!loading && !client" class="space-y-3">
        <p>Registra al cliente con el mismo ID de Google Sheets antes de enviar el reporte.</p>
        <router-link to="/admin/clients" class="text-blue-700 underline"
          >Administrar clientes</router-link
        >
      </div>
      <template v-if="client">
        <p class="mb-3 text-sm font-semibold">{{ client.name }} ({{ client.clientSheetId }})</p>
        <n-form-item label="Destinatarios">
          <n-select
            v-model:value="selectedIds"
            data-testid="report-recipient-select"
            multiple
            filterable
            :options="options"
            :disabled="sending || adding || loading"
            :input-props="{ 'aria-label': 'Destinatarios del reporte' }"
            placeholder="Selecciona los correos del cliente"
          />
        </n-form-item>
        <n-form @submit.prevent="add">
          <n-form-item label="Agregar un correo al cliente">
            <n-input
              v-model:value="email"
              :disabled="sending || adding"
              :maxlength="254"
              :input-props="{ 'aria-label': 'Nuevo destinatario' }"
              placeholder="correo@ejemplo.com"
            />
          </n-form-item>
          <n-button
            attr-type="submit"
            size="small"
            :loading="adding"
            :disabled="sending || !email.trim()"
            >Agregar destinatario</n-button
          >
        </n-form>
      </template>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <n-popconfirm
          v-if="client"
          positive-text="Confirmar envío"
          negative-text="Cancelar"
          @positive-click="send"
        >
          <template #trigger
            ><n-button
              type="primary"
              :loading="sending"
              :disabled="
                !configured ||
                !selectedIds.length ||
                selectedIds.length > 20 ||
                adding ||
                loading ||
                sending
              "
              >Enviar PDF seleccionado</n-button
            ></template
          >
          <p v-if="failedCount">
            Gmail no confirmó el envío anterior a todos los destinatarios. Revisa la carpeta
            Enviados antes de reintentar para evitar correos duplicados.
          </p>
          <p>¿Enviar la versión {{ targetVersion }} a {{ selectedEmails.join(', ') }}?</p>
        </n-popconfirm>
        <n-button size="small" :disabled="sending || adding" @click="load">
          Actualizar destinatarios
        </n-button>
      </div>
    </n-spin>
    <section
      v-if="result"
      class="mt-5 space-y-3"
      aria-label="Resultado del envío"
      aria-live="polite"
    >
      <n-alert
        :type="
          result.status === 'SUCCESS'
            ? 'success'
            : result.status === 'PARTIAL_FAILURE'
              ? 'warning'
              : 'error'
        "
      >
        <template v-if="result.status === 'SUCCESS'">Gmail aceptó todos los mensajes.</template>
        <template v-else-if="result.status === 'PARTIAL_FAILURE'">
          Gmail aceptó {{ sentCount }} de {{ result.results.length }} mensajes; no confirmó
          {{ failedCount }}.
        </template>
        <template v-else>Gmail no confirmó ningún envío.</template>
      </n-alert>
      <p v-if="failedCount" class="text-sm font-medium">
        Revisa la carpeta Enviados antes de reintentar para evitar posibles duplicados.
      </p>
      <ul class="space-y-1">
        <li
          v-for="recipient in result.results"
          :key="recipient.recipientId"
          class="flex flex-wrap justify-between gap-x-3 text-sm"
        >
          <span class="break-all">{{ recipient.email }}</span>
          <span :class="recipient.status === 'SENT' ? 'text-green-700' : 'text-amber-700'">
            {{ recipient.status === 'SENT' ? 'Aceptado por Gmail' : 'No confirmado' }}
          </span>
        </li>
      </ul>
    </section>
  </n-modal>
</template>
