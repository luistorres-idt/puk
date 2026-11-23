<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  CLIENT_ACCOUNT_STATUS_LABELS,
  DEFAULT_INVOICE_DUE_DAYS,
  INVOICE_PAYMENT_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
  type BillingClientAccount,
  type ClientAccountStatus,
  type Invoice,
  type InvoicePaymentStatus,
  type InvoiceType,
} from '@puk/contracts';
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDatePicker,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
  NTabPane,
  NTable,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui';
import AppLayout from '@/shared/layouts/AppLayout.vue';
import { useBilling } from '../useBilling.js';
import type { InvoiceFilterParams } from '../api.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const message = useMessage();
const {
  invoices,
  clients,
  selectedInvoice,
  loadingInvoices,
  loadingClients,
  loadingDetail,
  saving,
  error,
  formError,
  loadAll,
  loadInvoices,
  openInvoiceDetail,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  recordPayment,
  deletePayment,
  updateClientAccount,
  addClientEmail,
  removeClientEmail,
} = useBilling();

const activeTab = ref<'invoices' | 'clients'>('invoices');

const invoiceFilters = reactive<{
  search: string;
  clientId: string | null;
  paymentStatus: InvoicePaymentStatus | null;
  invoiceType: InvoiceType | null;
  overdueOnly: boolean;
}>({
  search: '',
  clientId: null,
  paymentStatus: null,
  invoiceType: null,
  overdueOnly: false,
});

const clientSearch = ref('');
const clientStatusFilter = ref<ClientAccountStatus | null>(null);

const showInvoiceModal = ref(false);
const editingInvoiceId = ref<string | null>(null);
const dueDateTouched = ref(false);
const invoiceForm = reactive<{
  folio: string;
  clientId: string | null;
  invoiceType: InvoiceType | null;
  totalAmount: number | null;
  issuedAt: number | null;
  dueAt: number | null;
  notes: string;
}>({
  folio: '',
  clientId: null,
  invoiceType: null,
  totalAmount: null,
  issuedAt: null,
  dueAt: null,
  notes: '',
});

const showPaymentsDrawer = ref(false);
const paymentForm = reactive<{
  amount: number | null;
  paidAt: number | null;
  reference: string;
  notes: string;
}>({
  amount: null,
  paidAt: null,
  reference: '',
  notes: '',
});

const showClientModal = ref(false);
const editingClientId = ref<string | null>(null);
const newContactEmail = ref('');
const clientForm = reactive<{
  accountStatus: ClientAccountStatus;
  legalName: string;
  platformClient: string;
  contactPhone: string;
  paymentPromiseDate: number | null;
}>({
  accountStatus: 'ACTIVE',
  legalName: '',
  platformClient: '',
  contactPhone: '',
  paymentPromiseDate: null,
});

const editingClient = computed(
  () => clients.value.find((item) => item.id === editingClientId.value) ?? null,
);

const clientSelectOptions = computed(() =>
  clients.value.map((client) => ({
    label: client.legalName ? `${client.name} · ${client.legalName}` : client.name,
    value: client.id,
  })),
);

const invoiceTypeOptions = (Object.keys(INVOICE_TYPE_LABELS) as InvoiceType[]).map((key) => ({
  label: INVOICE_TYPE_LABELS[key],
  value: key,
}));

const paymentStatusOptions = (
  Object.keys(INVOICE_PAYMENT_STATUS_LABELS) as InvoicePaymentStatus[]
).map((key) => ({
  label: INVOICE_PAYMENT_STATUS_LABELS[key],
  value: key,
}));

const accountStatusOptions = (
  Object.keys(CLIENT_ACCOUNT_STATUS_LABELS) as ClientAccountStatus[]
).map((key) => ({
  label: CLIENT_ACCOUNT_STATUS_LABELS[key],
  value: key,
}));

const totalDebtSummary = computed(() =>
  invoices.value.reduce((sum, item) => sum + item.balanceDue, 0),
);
const totalCollectedSummary = computed(() =>
  invoices.value.reduce((sum, item) => sum + item.paidAmount, 0),
);
const activeUnpaidCount = computed(
  () => invoices.value.filter((item) => item.paymentStatus === 'UNPAID').length,
);
const overdueCount = computed(() => invoices.value.filter((item) => item.isOverdue).length);

const filteredClients = computed(() => {
  const query = clientSearch.value.trim().toLowerCase();
  return clients.value.filter((client) => {
    if (clientStatusFilter.value && client.accountStatus !== clientStatusFilter.value) {
      return false;
    }
    if (!query) return true;
    return (
      client.name.toLowerCase().includes(query) ||
      (client.legalName?.toLowerCase().includes(query) ?? false) ||
      (client.platformClient?.toLowerCase().includes(query) ?? false) ||
      (client.contactPhone?.toLowerCase().includes(query) ?? false) ||
      client.emails.some((item) => item.email.toLowerCase().includes(query))
    );
  });
});

watch(
  () => invoiceForm.issuedAt,
  (nextIssuedAt) => {
    if (!showInvoiceModal.value || editingInvoiceId.value !== null || dueDateTouched.value) return;
    if (nextIssuedAt !== null) {
      invoiceForm.dueAt = nextIssuedAt + DEFAULT_INVOICE_DUE_DAYS * MS_PER_DAY;
    }
  },
);

function currentFilterParams(): InvoiceFilterParams {
  return {
    ...(invoiceFilters.search.trim() ? { search: invoiceFilters.search.trim() } : {}),
    ...(invoiceFilters.clientId ? { clientId: invoiceFilters.clientId } : {}),
    ...(invoiceFilters.paymentStatus ? { paymentStatus: invoiceFilters.paymentStatus } : {}),
    ...(invoiceFilters.invoiceType ? { invoiceType: invoiceFilters.invoiceType } : {}),
    ...(invoiceFilters.overdueOnly ? { overdueOnly: true } : {}),
  };
}

async function applyInvoiceFilters(): Promise<void> {
  await loadInvoices(currentFilterParams());
}

async function clearInvoiceFilters(): Promise<void> {
  invoiceFilters.search = '';
  invoiceFilters.clientId = null;
  invoiceFilters.paymentStatus = null;
  invoiceFilters.invoiceType = null;
  invoiceFilters.overdueOnly = false;
  await loadInvoices({});
}

function openCreateInvoice(): void {
  const today = startOfTodayTimestamp();
  editingInvoiceId.value = null;
  dueDateTouched.value = false;
  invoiceForm.folio = '';
  invoiceForm.clientId = null;
  invoiceForm.invoiceType = null;
  invoiceForm.totalAmount = null;
  invoiceForm.issuedAt = today;
  invoiceForm.dueAt = today + DEFAULT_INVOICE_DUE_DAYS * MS_PER_DAY;
  invoiceForm.notes = '';
  formError.value = null;
  showInvoiceModal.value = true;
}

function openEditInvoice(invoice: Invoice): void {
  editingInvoiceId.value = invoice.id;
  dueDateTouched.value = true;
  invoiceForm.folio = invoice.folio;
  invoiceForm.clientId = invoice.clientId;
  invoiceForm.invoiceType = invoice.invoiceType;
  invoiceForm.totalAmount = invoice.totalAmount;
  invoiceForm.issuedAt = Date.parse(invoice.issuedAt);
  invoiceForm.dueAt = Date.parse(invoice.dueAt);
  invoiceForm.notes = invoice.notes ?? '';
  formError.value = null;
  showInvoiceModal.value = true;
}

function handleDueDateManualChange(value: number | null): void {
  dueDateTouched.value = true;
  invoiceForm.dueAt = value;
}

async function submitInvoice(): Promise<void> {
  if (!invoiceForm.folio.trim() || !invoiceForm.clientId || !invoiceForm.totalAmount) {
    formError.value = 'Completa folio, cliente y total de factura.';
    return;
  }
  if (invoiceForm.issuedAt === null || invoiceForm.dueAt === null) {
    formError.value = 'Selecciona las fechas de facturación y vencimiento.';
    return;
  }
  if (invoiceForm.dueAt < invoiceForm.issuedAt) {
    formError.value = 'La fecha de vencimiento no puede ser anterior a la fecha de facturación.';
    return;
  }

  const payload = {
    folio: invoiceForm.folio.trim(),
    clientId: invoiceForm.clientId,
    invoiceType: invoiceForm.invoiceType,
    totalAmount: Number(invoiceForm.totalAmount.toFixed(2)),
    issuedAt: new Date(invoiceForm.issuedAt).toISOString(),
    dueAt: new Date(invoiceForm.dueAt).toISOString(),
    notes: invoiceForm.notes.trim() || null,
  };

  const result = editingInvoiceId.value
    ? await updateInvoice(editingInvoiceId.value, payload, currentFilterParams())
    : await createInvoice(payload, currentFilterParams());

  if (result) {
    showInvoiceModal.value = false;
    message.success(editingInvoiceId.value ? 'Factura actualizada.' : 'Factura registrada.');
  }
}

async function handleDeleteInvoice(id: string): Promise<void> {
  if (await deleteInvoice(id, currentFilterParams())) {
    message.success('Factura eliminada.');
  }
}

async function openPayments(invoice: Invoice): Promise<void> {
  showPaymentsDrawer.value = true;
  const loaded = await openInvoiceDetail(invoice.id);
  if (loaded && selectedInvoice.value) {
    resetPaymentForm(selectedInvoice.value.balanceDue);
  }
}

function resetPaymentForm(suggestedAmount: number): void {
  paymentForm.amount = suggestedAmount > 0 ? suggestedAmount : null;
  paymentForm.paidAt = startOfTodayTimestamp();
  paymentForm.reference = '';
  paymentForm.notes = '';
}

async function submitPayment(): Promise<void> {
  if (!selectedInvoice.value) return;
  if (!paymentForm.amount || paymentForm.amount <= 0 || paymentForm.paidAt === null) {
    formError.value = 'Ingresa un monto válido y la fecha de pago.';
    return;
  }

  const updated = await recordPayment(
    selectedInvoice.value.id,
    {
      amount: Number(paymentForm.amount.toFixed(2)),
      paidAt: new Date(paymentForm.paidAt).toISOString(),
      reference: paymentForm.reference.trim() || null,
      notes: paymentForm.notes.trim() || null,
    },
    currentFilterParams(),
  );

  if (updated) {
    resetPaymentForm(updated.balanceDue);
    message.success(
      updated.paymentStatus === 'PAID'
        ? 'Pago registrado. La factura pasó automáticamente a Pagada.'
        : 'Abono registrado correctamente.',
    );
  }
}

async function handleDeletePayment(paymentId: string): Promise<void> {
  if (!selectedInvoice.value) return;
  const updated = await deletePayment(selectedInvoice.value.id, paymentId, currentFilterParams());
  if (updated) {
    resetPaymentForm(updated.balanceDue);
    message.success('Pago eliminado y saldo recalculado.');
  }
}

function openEditClient(client: BillingClientAccount): void {
  editingClientId.value = client.id;
  clientForm.accountStatus = client.accountStatus;
  clientForm.legalName = client.legalName ?? '';
  clientForm.platformClient = client.platformClient ?? '';
  clientForm.contactPhone = client.contactPhone ?? '';
  clientForm.paymentPromiseDate = client.paymentPromiseDate
    ? Date.parse(client.paymentPromiseDate)
    : null;
  newContactEmail.value = '';
  formError.value = null;
  showClientModal.value = true;
}

async function submitClientAccount(): Promise<void> {
  if (!editingClientId.value) return;
  if (clientForm.accountStatus === 'PAYMENT_PROMISE' && clientForm.paymentPromiseDate === null) {
    formError.value =
      'La fecha de promesa de pago es obligatoria cuando el estatus es Promesa de pago.';
    return;
  }

  const updated = await updateClientAccount(editingClientId.value, {
    accountStatus: clientForm.accountStatus,
    legalName: clientForm.legalName.trim() || null,
    platformClient: clientForm.platformClient.trim() || null,
    contactPhone: clientForm.contactPhone.trim() || null,
    paymentPromiseDate:
      clientForm.paymentPromiseDate !== null
        ? new Date(clientForm.paymentPromiseDate).toISOString()
        : null,
  });

  if (updated) {
    showClientModal.value = false;
    message.success('Cuenta del cliente actualizada.');
  }
}

async function handleAddClientEmail(): Promise<void> {
  if (!editingClientId.value || !newContactEmail.value.trim()) return;
  if (await addClientEmail(editingClientId.value, newContactEmail.value.trim())) {
    newContactEmail.value = '';
    message.success('Correo agregado.');
  }
}

async function handleRemoveClientEmail(emailId: string): Promise<void> {
  if (!editingClientId.value) return;
  if (await removeClientEmail(editingClientId.value, emailId)) {
    message.success('Correo eliminado.');
  }
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function accountStatusTagType(
  status: ClientAccountStatus,
): 'success' | 'error' | 'warning' | 'info' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'error';
    case 'PAYMENT_PROMISE':
      return 'warning';
    case 'PAYMENT_IN_PROGRESS':
      return 'info';
  }
}

function startOfTodayTimestamp(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

onMounted(() => {
  void loadAll();
});
</script>

<template>
  <app-layout wide>
    <section data-tour-page="billing" class="space-y-5">
      <header class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Facturación y Cobranza</h1>
          <p class="mt-1 text-sm text-slate-600">
            Administra facturas, abonos y estatus de cuenta de los clientes registrados.
          </p>
        </div>
        <div data-tour="billing-actions" class="flex flex-wrap gap-2">
          <n-button
            secondary
            size="small"
            :loading="loadingInvoices || loadingClients"
            @click="loadAll(currentFilterParams())"
          >
            Actualizar
          </n-button>
          <n-button type="primary" size="small" @click="openCreateInvoice">
            Nueva factura
          </n-button>
        </div>
      </header>

      <n-alert v-if="error" type="error" role="alert">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span>{{ error }}</span>
          <n-button size="small" @click="loadAll(currentFilterParams())">Reintentar</n-button>
        </div>
      </n-alert>

      <div data-tour="billing-summary" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <n-card size="small" class="shadow-sm">
          <p class="text-xs font-medium text-slate-500">Deuda total por cobrar</p>
          <p class="mt-1 text-xl font-bold text-rose-700">{{ formatMoney(totalDebtSummary) }}</p>
        </n-card>
        <n-card size="small" class="shadow-sm">
          <p class="text-xs font-medium text-slate-500">Facturas activas (no pagadas)</p>
          <p class="mt-1 text-xl font-bold text-slate-900">{{ activeUnpaidCount }}</p>
        </n-card>
        <n-card size="small" class="shadow-sm">
          <p class="text-xs font-medium text-slate-500">Facturas vencidas</p>
          <p class="mt-1 text-xl font-bold text-amber-700">{{ overdueCount }}</p>
        </n-card>
        <n-card size="small" class="shadow-sm">
          <p class="text-xs font-medium text-slate-500">Total pagado</p>
          <p class="mt-1 text-xl font-bold text-emerald-700">
            {{ formatMoney(totalCollectedSummary) }}
          </p>
        </n-card>
      </div>

      <n-card data-tour="billing-tabs" class="shadow-sm">
        <n-tabs v-model:value="activeTab" type="line" animated>
          <n-tab-pane name="invoices" :tab="`Facturas (${invoices.length})`">
            <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <n-input
                v-model:value="invoiceFilters.search"
                clearable
                size="small"
                placeholder="Buscar folio o cliente"
                @keyup.enter="applyInvoiceFilters"
              />
              <n-select
                v-model:value="invoiceFilters.clientId"
                clearable
                filterable
                size="small"
                :options="clientSelectOptions"
                placeholder="Filtrar por cliente"
              />
              <n-select
                v-model:value="invoiceFilters.paymentStatus"
                clearable
                size="small"
                :options="paymentStatusOptions"
                placeholder="Estatus de pago"
              />
              <n-select
                v-model:value="invoiceFilters.invoiceType"
                clearable
                size="small"
                :options="invoiceTypeOptions"
                placeholder="Tipo de factura"
              />
              <div class="flex items-center">
                <n-checkbox v-model:checked="invoiceFilters.overdueOnly">Solo vencidas</n-checkbox>
              </div>
              <div class="flex justify-end gap-2">
                <n-button size="small" secondary @click="clearInvoiceFilters">Limpiar</n-button>
                <n-button size="small" type="primary" @click="applyInvoiceFilters">
                  Filtrar
                </n-button>
              </div>
            </div>

            <n-spin :show="loadingInvoices">
              <n-empty
                v-if="!invoices.length && !loadingInvoices"
                description="No hay facturas registradas con los filtros seleccionados."
              />
              <div v-else class="overflow-x-auto">
                <n-table :bordered="false" :single-line="false" class="min-w-[1040px]">
                  <thead>
                    <tr>
                      <th class="whitespace-nowrap">Folio</th>
                      <th class="min-w-[180px]">Cliente</th>
                      <th class="whitespace-nowrap">Tipo</th>
                      <th class="whitespace-nowrap">Estatus pago</th>
                      <th class="whitespace-nowrap text-right">Total factura</th>
                      <th class="whitespace-nowrap text-right">Total pagado</th>
                      <th class="whitespace-nowrap text-right">Deuda total</th>
                      <th class="whitespace-nowrap">Facturación</th>
                      <th class="whitespace-nowrap">Vencimiento</th>
                      <th class="whitespace-nowrap">Fecha pago</th>
                      <th class="whitespace-nowrap text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="invoice in invoices" :key="invoice.id">
                      <td class="whitespace-nowrap font-semibold">{{ invoice.folio }}</td>
                      <td>
                        <div class="font-medium text-slate-900">{{ invoice.client.name }}</div>
                        <div v-if="invoice.client.legalName" class="text-xs text-slate-500">
                          {{ invoice.client.legalName }}
                        </div>
                      </td>
                      <td class="whitespace-nowrap">
                        {{
                          invoice.invoiceType
                            ? INVOICE_TYPE_LABELS[invoice.invoiceType]
                            : 'Sin especificar'
                        }}
                      </td>
                      <td class="whitespace-nowrap">
                        <div class="flex flex-wrap items-center gap-1">
                          <n-tag
                            size="small"
                            round
                            :type="invoice.paymentStatus === 'PAID' ? 'success' : 'warning'"
                          >
                            {{ INVOICE_PAYMENT_STATUS_LABELS[invoice.paymentStatus] }}
                          </n-tag>
                          <n-tag v-if="invoice.isOverdue" size="small" round type="error">
                            Vencida
                          </n-tag>
                        </div>
                      </td>
                      <td class="whitespace-nowrap text-right">
                        {{ formatMoney(invoice.totalAmount) }}
                      </td>
                      <td class="whitespace-nowrap text-right text-emerald-700">
                        {{ formatMoney(invoice.paidAmount) }}
                      </td>
                      <td class="whitespace-nowrap text-right font-semibold text-rose-700">
                        {{ formatMoney(invoice.balanceDue) }}
                      </td>
                      <td class="whitespace-nowrap">{{ formatDate(invoice.issuedAt) }}</td>
                      <td class="whitespace-nowrap">{{ formatDate(invoice.dueAt) }}</td>
                      <td class="whitespace-nowrap">{{ formatDate(invoice.paidAt) }}</td>
                      <td class="whitespace-nowrap">
                        <div class="flex justify-end gap-1.5">
                          <n-button size="small" type="primary" secondary @click="openPayments(invoice)">
                            Pagos ({{ invoice.paymentsCount }})
                          </n-button>
                          <n-button size="small" secondary @click="openEditInvoice(invoice)">
                            Editar
                          </n-button>
                          <n-popconfirm
                            positive-text="Eliminar"
                            negative-text="Cancelar"
                            @positive-click="handleDeleteInvoice(invoice.id)"
                          >
                            <template #trigger>
                              <n-button size="small" type="error" secondary>Eliminar</n-button>
                            </template>
                            ¿Eliminar la factura {{ invoice.folio }}?
                          </n-popconfirm>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </n-table>
              </div>
            </n-spin>
          </n-tab-pane>

          <n-tab-pane name="clients" :tab="`Cuentas de clientes (${clients.length})`">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row">
              <n-input
                v-model:value="clientSearch"
                clearable
                size="small"
                class="sm:max-w-sm"
                placeholder="Buscar nombre, razón social, plataforma o contacto"
              />
              <n-select
                v-model:value="clientStatusFilter"
                clearable
                size="small"
                class="sm:max-w-xs"
                :options="accountStatusOptions"
                placeholder="Estatus de cuenta"
              />
            </div>

            <n-spin :show="loadingClients">
              <n-empty
                v-if="!filteredClients.length && !loadingClients"
                description="No hay clientes que coincidan con el filtro."
              />
              <div v-else class="overflow-x-auto">
                <n-table :bordered="false" :single-line="false" class="min-w-[1000px]">
                  <thead>
                    <tr>
                      <th class="min-w-[240px]">Cliente</th>
                      <th class="min-w-[155px] whitespace-nowrap">Estatus de cuenta</th>
                      <th class="min-w-[180px] whitespace-nowrap">Fechas de seguimiento</th>
                      <th class="min-w-[220px]">Contacto</th>
                      <th class="whitespace-nowrap text-right">Deuda total</th>
                      <th class="whitespace-nowrap text-right">Facturas activas</th>
                      <th class="whitespace-nowrap text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="client in filteredClients" :key="client.id">
                      <td class="align-top">
                        <div class="font-semibold text-slate-900">{{ client.name }}</div>
                        <div class="mt-0.5 text-xs text-slate-600">
                          <span class="text-slate-400">Razón social:</span>
                          {{ client.legalName ?? '—' }}
                        </div>
                        <div class="mt-0.5 text-xs text-slate-600">
                          <span class="text-slate-400">Plataforma:</span>
                          {{ client.platformClient ?? '—' }}
                        </div>
                      </td>
                      <td class="align-top whitespace-nowrap">
                        <n-tag
                          size="medium"
                          round
                          :type="accountStatusTagType(client.accountStatus)"
                        >
                          {{ CLIENT_ACCOUNT_STATUS_LABELS[client.accountStatus] }}
                        </n-tag>
                      </td>
                      <td class="align-top whitespace-nowrap">
                        <div class="space-y-1 text-xs">
                          <div>
                            <span class="text-slate-400">Suspensión:</span>
                            <span
                              :class="
                                client.suspendedAt
                                  ? 'ml-1 font-medium text-rose-700'
                                  : 'ml-1 text-slate-500'
                              "
                            >
                              {{ formatDate(client.suspendedAt) }}
                            </span>
                          </div>
                          <div>
                            <span class="text-slate-400">Promesa pago:</span>
                            <span
                              :class="
                                client.paymentPromiseDate
                                  ? 'ml-1 font-medium text-amber-700'
                                  : 'ml-1 text-slate-500'
                              "
                            >
                              {{ formatDate(client.paymentPromiseDate) }}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td class="align-top">
                        <div class="space-y-1 text-xs">
                          <div v-if="client.contactPhone" class="font-medium text-slate-700">
                            Cel: {{ client.contactPhone }}
                          </div>
                          <div
                            v-for="mail in client.emails"
                            :key="mail.id"
                            class="break-all text-slate-600"
                          >
                            {{ mail.email }}
                          </div>
                          <span
                            v-if="!client.contactPhone && !client.emails.length"
                            class="text-slate-400"
                          >
                            Sin contacto registrado
                          </span>
                        </div>
                      </td>
                      <td class="align-top whitespace-nowrap text-right">
                        <span
                          class="text-sm font-bold"
                          :class="client.totalDebt > 0 ? 'text-rose-700' : 'text-emerald-700'"
                        >
                          {{ formatMoney(client.totalDebt) }}
                        </span>
                      </td>
                      <td class="align-top whitespace-nowrap text-right">
                        <div class="font-semibold text-slate-900">
                          {{ client.activeInvoicesCount }}
                        </div>
                        <div class="text-[11px] text-slate-400">
                          de {{ client.totalInvoicesCount }} totales
                        </div>
                      </td>
                      <td class="align-top whitespace-nowrap text-right">
                        <n-button size="small" secondary @click="openEditClient(client)">
                          Editar cuenta
                        </n-button>
                      </td>
                    </tr>
                  </tbody>
                </n-table>
              </div>
            </n-spin>
          </n-tab-pane>
        </n-tabs>
      </n-card>

      <!-- Modal Crear / Editar Factura -->
      <n-modal
        v-model:show="showInvoiceModal"
        preset="card"
        :title="editingInvoiceId ? 'Editar factura' : 'Nueva factura'"
        class="w-[94vw] max-w-xl"
      >
        <n-alert v-if="formError" type="error" class="mb-4">{{ formError }}</n-alert>
        <n-form @submit.prevent="submitInvoice">
          <div class="grid gap-3 sm:grid-cols-2">
            <n-form-item label="Folio" required>
              <n-input
                v-model:value="invoiceForm.folio"
                :maxlength="100"
                placeholder="Ej. FAC-2026-001"
              />
            </n-form-item>
            <n-form-item label="Cliente" required>
              <n-select
                v-model:value="invoiceForm.clientId"
                filterable
                :options="clientSelectOptions"
                placeholder="Selecciona un cliente"
              />
            </n-form-item>
            <n-form-item label="Tipo de factura (opcional)">
              <n-select
                v-model:value="invoiceForm.invoiceType"
                clearable
                :options="invoiceTypeOptions"
                placeholder="Sin especificar"
              />
            </n-form-item>
            <n-form-item label="Total factura (MXN)" required>
              <n-input-number
                v-model:value="invoiceForm.totalAmount"
                :min="0.01"
                :precision="2"
                :show-button="false"
                class="w-full"
                placeholder="0.00"
              />
            </n-form-item>
            <n-form-item label="Fecha facturación" required>
              <n-date-picker
                v-model:value="invoiceForm.issuedAt"
                type="date"
                class="w-full"
              />
            </n-form-item>
            <n-form-item label="Fecha vencimiento (+20 días editable)" required>
              <n-date-picker
                :value="invoiceForm.dueAt"
                type="date"
                class="w-full"
                @update:value="handleDueDateManualChange"
              />
            </n-form-item>
          </div>
          <n-form-item label="Notas (opcional)">
            <n-input
              v-model:value="invoiceForm.notes"
              type="textarea"
              :rows="2"
              :maxlength="2000"
              placeholder="Observaciones adicionales"
            />
          </n-form-item>
          <div class="flex justify-end gap-2">
            <n-button :disabled="saving" @click="showInvoiceModal = false">Cancelar</n-button>
            <n-button attr-type="submit" type="primary" :loading="saving">
              {{ editingInvoiceId ? 'Guardar cambios' : 'Registrar factura' }}
            </n-button>
          </div>
        </n-form>
      </n-modal>

      <!-- Drawer Historial de Pagos -->
      <n-drawer v-model:show="showPaymentsDrawer" :width="520" placement="right">
        <n-drawer-content
          :title="selectedInvoice ? `Pagos · ${selectedInvoice.folio}` : 'Historial de pagos'"
          closable
        >
          <n-spin :show="loadingDetail">
            <n-alert v-if="formError" type="error" class="mb-4">{{ formError }}</n-alert>

            <template v-if="selectedInvoice">
              <div
                class="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center"
              >
                <div>
                  <p class="text-[11px] text-slate-500">Total factura</p>
                  <p class="font-semibold">{{ formatMoney(selectedInvoice.totalAmount) }}</p>
                </div>
                <div>
                  <p class="text-[11px] text-slate-500">Total pagado</p>
                  <p class="font-semibold text-emerald-700">
                    {{ formatMoney(selectedInvoice.paidAmount) }}
                  </p>
                </div>
                <div>
                  <p class="text-[11px] text-slate-500">Deuda total</p>
                  <p class="font-semibold text-rose-700">
                    {{ formatMoney(selectedInvoice.balanceDue) }}
                  </p>
                </div>
              </div>

              <div class="mb-4 flex items-center justify-between text-xs text-slate-600">
                <span>Cliente: <strong>{{ selectedInvoice.client.name }}</strong></span>
                <n-tag
                  size="small"
                  round
                  :type="selectedInvoice.paymentStatus === 'PAID' ? 'success' : 'warning'"
                >
                  {{ INVOICE_PAYMENT_STATUS_LABELS[selectedInvoice.paymentStatus] }}
                </n-tag>
              </div>

              <n-card
                v-if="selectedInvoice.balanceDue > 0"
                size="small"
                title="Registrar abono / pago"
                class="mb-4"
              >
                <n-form @submit.prevent="submitPayment">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <n-form-item label="Monto (MXN)" required>
                      <n-input-number
                        v-model:value="paymentForm.amount"
                        :min="0.01"
                        :max="selectedInvoice.balanceDue"
                        :precision="2"
                        :show-button="false"
                        class="w-full"
                      />
                    </n-form-item>
                    <n-form-item label="Fecha de pago" required>
                      <n-date-picker
                        v-model:value="paymentForm.paidAt"
                        type="date"
                        class="w-full"
                      />
                    </n-form-item>
                  </div>
                  <n-form-item label="Referencia (opcional)">
                    <n-input
                      v-model:value="paymentForm.reference"
                      :maxlength="200"
                      placeholder="Transferencia, SPEI, cheque..."
                    />
                  </n-form-item>
                  <n-form-item label="Notas (opcional)">
                    <n-input
                      v-model:value="paymentForm.notes"
                      :maxlength="1000"
                      placeholder="Comentario del abono"
                    />
                  </n-form-item>
                  <n-button attr-type="submit" type="primary" block :loading="saving">
                    Registrar pago
                  </n-button>
                </n-form>
              </n-card>

              <h3 class="mb-2 text-sm font-semibold text-slate-800">
                Historial de pagos ({{ selectedInvoice.payments.length }})
              </h3>
              <n-empty
                v-if="!selectedInvoice.payments.length"
                description="Todavía no hay pagos registrados para esta factura."
              />
              <div v-else class="space-y-2">
                <div
                  v-for="payment in selectedInvoice.payments"
                  :key="payment.id"
                  class="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                >
                  <div class="space-y-0.5">
                    <div class="font-semibold text-emerald-700">
                      {{ formatMoney(payment.amount) }}
                      <span class="ml-2 text-xs font-normal text-slate-500">
                        {{ formatDate(payment.paidAt) }}
                      </span>
                    </div>
                    <div v-if="payment.reference" class="text-xs text-slate-700">
                      Ref: {{ payment.reference }}
                    </div>
                    <div v-if="payment.notes" class="text-xs text-slate-500">
                      {{ payment.notes }}
                    </div>
                    <div class="text-[11px] text-slate-400">
                      Registrado por {{ payment.recordedByName }}
                    </div>
                  </div>
                  <n-popconfirm
                    positive-text="Eliminar"
                    negative-text="Cancelar"
                    @positive-click="handleDeletePayment(payment.id)"
                  >
                    <template #trigger>
                      <n-button size="tiny" type="error" secondary :disabled="saving">
                        Eliminar
                      </n-button>
                    </template>
                    ¿Eliminar este pago y recalcular el saldo de la factura?
                  </n-popconfirm>
                </div>
              </div>
            </template>
          </n-spin>
        </n-drawer-content>
      </n-drawer>

      <!-- Modal Editar Cuenta Cliente -->
      <n-modal
        v-model:show="showClientModal"
        preset="card"
        :title="editingClient ? `Cuenta · ${editingClient.name}` : 'Editar cuenta de cliente'"
        class="w-[94vw] max-w-xl"
      >
        <n-alert v-if="formError" type="error" class="mb-4">{{ formError }}</n-alert>

        <n-form v-if="editingClient" @submit.prevent="submitClientAccount">
          <div class="grid gap-3 sm:grid-cols-2">
            <n-form-item label="Estatus de cuenta" required>
              <n-select
                v-model:value="clientForm.accountStatus"
                :options="accountStatusOptions"
              />
            </n-form-item>
            <n-form-item
              label="Fecha promesa de pago"
              :required="clientForm.accountStatus === 'PAYMENT_PROMISE'"
            >
              <n-date-picker
                v-model:value="clientForm.paymentPromiseDate"
                type="date"
                clearable
                class="w-full"
              />
            </n-form-item>
            <n-form-item label="Razón social">
              <n-input v-model:value="clientForm.legalName" :maxlength="250" />
            </n-form-item>
            <n-form-item label="Cliente plataforma">
              <n-input v-model:value="clientForm.platformClient" :maxlength="200" />
            </n-form-item>
            <n-form-item label="Celular">
              <n-input v-model:value="clientForm.contactPhone" :maxlength="50" />
            </n-form-item>
            <n-form-item label="Fecha de suspensión (automática)">
              <n-input
                :value="
                  clientForm.accountStatus === 'SUSPENDED'
                    ? editingClient.suspendedAt
                      ? formatDate(editingClient.suspendedAt)
                      : 'Se asignará automáticamente al guardar'
                    : 'Se limpiará al guardar'
                "
                disabled
              />
            </n-form-item>
          </div>

          <div class="mb-4 rounded-lg border border-slate-200 p-3">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Correos de contacto
            </p>
            <div v-if="editingClient.emails.length" class="mb-3 flex flex-wrap gap-2">
              <n-tag
                v-for="mail in editingClient.emails"
                :key="mail.id"
                closable
                size="small"
                @close="handleRemoveClientEmail(mail.id)"
              >
                {{ mail.email }}
              </n-tag>
            </div>
            <p v-else class="mb-2 text-xs text-slate-400">Sin correos registrados.</p>
            <div class="flex gap-2">
              <n-input
                v-model:value="newContactEmail"
                size="small"
                placeholder="nuevo@correo.com"
                @keyup.enter.prevent="handleAddClientEmail"
              />
              <n-button
                size="small"
                secondary
                :loading="saving"
                :disabled="!newContactEmail.trim()"
                @click="handleAddClientEmail"
              >
                Agregar correo
              </n-button>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <n-button :disabled="saving" @click="showClientModal = false">Cancelar</n-button>
            <n-button attr-type="submit" type="primary" :loading="saving">Guardar cambios</n-button>
          </div>
        </n-form>
      </n-modal>
    </section>
  </app-layout>
</template>
