import { ref } from 'vue';
import type {
  BillingClientAccount,
  CreateInvoice,
  Invoice,
  InvoiceDetail,
  RecordInvoicePayment,
  UpdateBillingClientAccount,
  UpdateInvoice,
} from '@puk/contracts';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import * as billingApi from './api.js';
import type { InvoiceFilterParams } from './api.js';

export function useBilling() {
  const invoices = ref<Invoice[]>([]);
  const clients = ref<BillingClientAccount[]>([]);
  const selectedInvoice = ref<InvoiceDetail | null>(null);
  const loadingInvoices = ref(false);
  const loadingClients = ref(false);
  const loadingDetail = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const formError = ref<string | null>(null);

  async function loadInvoices(filters: InvoiceFilterParams = {}): Promise<void> {
    loadingInvoices.value = true;
    error.value = null;
    try {
      invoices.value = await billingApi.listInvoices(filters);
    } catch (err) {
      error.value = extractApiErrorMessage(err, 'No se pudieron cargar las facturas.');
    } finally {
      loadingInvoices.value = false;
    }
  }

  async function loadClients(): Promise<void> {
    loadingClients.value = true;
    error.value = null;
    try {
      clients.value = await billingApi.listBillingClients();
    } catch (err) {
      error.value = extractApiErrorMessage(err, 'No se pudieron cargar las cuentas de clientes.');
    } finally {
      loadingClients.value = false;
    }
  }

  async function loadAll(filters: InvoiceFilterParams = {}): Promise<void> {
    await Promise.all([loadInvoices(filters), loadClients()]);
  }

  async function openInvoiceDetail(id: string): Promise<boolean> {
    loadingDetail.value = true;
    formError.value = null;
    try {
      selectedInvoice.value = await billingApi.getInvoice(id);
      return true;
    } catch (err) {
      formError.value = extractApiErrorMessage(err, 'No se pudo cargar el detalle de la factura.');
      return false;
    } finally {
      loadingDetail.value = false;
    }
  }

  async function runSave<T>(work: () => Promise<T>): Promise<T | null> {
    if (saving.value) return null;
    saving.value = true;
    formError.value = null;
    try {
      return await work();
    } catch (err) {
      formError.value = extractApiErrorMessage(err, 'No se pudo guardar el cambio.');
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function createInvoice(
    input: CreateInvoice,
    filters: InvoiceFilterParams = {},
  ): Promise<InvoiceDetail | null> {
    return runSave(async () => {
      const created = await billingApi.createInvoice(input);
      await loadAll(filters);
      return created;
    });
  }

  async function updateInvoice(
    id: string,
    input: UpdateInvoice,
    filters: InvoiceFilterParams = {},
  ): Promise<InvoiceDetail | null> {
    return runSave(async () => {
      const updated = await billingApi.updateInvoice(id, input);
      if (selectedInvoice.value?.id === id) selectedInvoice.value = updated;
      await loadAll(filters);
      return updated;
    });
  }

  async function deleteInvoice(id: string, filters: InvoiceFilterParams = {}): Promise<boolean> {
    const result = await runSave(async () => {
      await billingApi.deleteInvoice(id);
      if (selectedInvoice.value?.id === id) selectedInvoice.value = null;
      await loadAll(filters);
      return true;
    });
    return result === true;
  }

  async function recordPayment(
    invoiceId: string,
    input: RecordInvoicePayment,
    filters: InvoiceFilterParams = {},
  ): Promise<InvoiceDetail | null> {
    return runSave(async () => {
      const updated = await billingApi.recordInvoicePayment(invoiceId, input);
      selectedInvoice.value = updated;
      await loadAll(filters);
      return updated;
    });
  }

  async function deletePayment(
    invoiceId: string,
    paymentId: string,
    filters: InvoiceFilterParams = {},
  ): Promise<InvoiceDetail | null> {
    return runSave(async () => {
      const updated = await billingApi.deleteInvoicePayment(invoiceId, paymentId);
      selectedInvoice.value = updated;
      await loadAll(filters);
      return updated;
    });
  }

  async function updateClientAccount(
    clientId: string,
    input: UpdateBillingClientAccount,
  ): Promise<BillingClientAccount | null> {
    return runSave(async () => {
      const updated = await billingApi.updateBillingClient(clientId, input);
      const index = clients.value.findIndex((item) => item.id === clientId);
      if (index >= 0) clients.value[index] = updated;
      else clients.value.push(updated);
      return updated;
    });
  }

  async function addClientEmail(clientId: string, email: string): Promise<boolean> {
    const result = await runSave(async () => {
      const created = await billingApi.addBillingClientEmail(clientId, { email });
      const client = clients.value.find((item) => item.id === clientId);
      if (client) {
        client.emails = [...client.emails, created].sort((a, b) => a.email.localeCompare(b.email));
      }
      return true;
    });
    return result === true;
  }

  async function removeClientEmail(clientId: string, emailId: string): Promise<boolean> {
    const result = await runSave(async () => {
      await billingApi.removeBillingClientEmail(clientId, emailId);
      const client = clients.value.find((item) => item.id === clientId);
      if (client) {
        client.emails = client.emails.filter((item) => item.id !== emailId);
      }
      return true;
    });
    return result === true;
  }

  return {
    invoices,
    clients,
    selectedInvoice,
    loadingInvoices,
    loadingClients,
    loadingDetail,
    saving,
    error,
    formError,
    loadInvoices,
    loadClients,
    loadAll,
    openInvoiceDetail,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    recordPayment,
    deletePayment,
    updateClientAccount,
    addClientEmail,
    removeClientEmail,
  };
}
