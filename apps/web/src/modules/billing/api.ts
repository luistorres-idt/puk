import type {
  BillingClientAccount,
  ClientEmail,
  CreateInvoice,
  Invoice,
  InvoiceDetail,
  InvoicePaymentStatus,
  InvoiceType,
  RecordInvoicePayment,
  SaveClientEmail,
  UpdateBillingClientAccount,
  UpdateInvoice,
} from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';

export interface InvoiceFilterParams {
  clientId?: string;
  paymentStatus?: InvoicePaymentStatus;
  invoiceType?: InvoiceType;
  overdueOnly?: boolean;
  search?: string;
}

export async function listInvoices(filters: InvoiceFilterParams = {}): Promise<Invoice[]> {
  const params: Record<string, string> = {};
  if (filters.clientId) params.clientId = filters.clientId;
  if (filters.paymentStatus) params.paymentStatus = filters.paymentStatus;
  if (filters.invoiceType) params.invoiceType = filters.invoiceType;
  if (filters.overdueOnly) params.overdueOnly = 'true';
  if (filters.search?.trim()) params.search = filters.search.trim();

  return (await api.get<ApiResponse<Invoice[]>>('/billing/invoices', { params })).data.data;
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  return (await api.get<ApiResponse<InvoiceDetail>>(`/billing/invoices/${id}`)).data.data;
}

export async function createInvoice(input: CreateInvoice): Promise<InvoiceDetail> {
  return (await api.post<ApiResponse<InvoiceDetail>>('/billing/invoices', input)).data.data;
}

export async function updateInvoice(id: string, input: UpdateInvoice): Promise<InvoiceDetail> {
  return (await api.patch<ApiResponse<InvoiceDetail>>(`/billing/invoices/${id}`, input)).data.data;
}

export async function deleteInvoice(id: string): Promise<void> {
  await api.delete(`/billing/invoices/${id}`);
}

export async function recordInvoicePayment(
  invoiceId: string,
  input: RecordInvoicePayment,
): Promise<InvoiceDetail> {
  return (
    await api.post<ApiResponse<InvoiceDetail>>(`/billing/invoices/${invoiceId}/payments`, input)
  ).data.data;
}

export async function deleteInvoicePayment(
  invoiceId: string,
  paymentId: string,
): Promise<InvoiceDetail> {
  return (
    await api.delete<ApiResponse<InvoiceDetail>>(
      `/billing/invoices/${invoiceId}/payments/${paymentId}`,
    )
  ).data.data;
}

export async function listBillingClients(): Promise<BillingClientAccount[]> {
  return (await api.get<ApiResponse<BillingClientAccount[]>>('/billing/clients')).data.data;
}

export async function updateBillingClient(
  id: string,
  input: UpdateBillingClientAccount,
): Promise<BillingClientAccount> {
  return (await api.patch<ApiResponse<BillingClientAccount>>(`/billing/clients/${id}`, input)).data
    .data;
}

export async function addBillingClientEmail(
  id: string,
  input: SaveClientEmail,
): Promise<ClientEmail> {
  return (await api.post<ApiResponse<ClientEmail>>(`/billing/clients/${id}/emails`, input)).data
    .data;
}

export async function removeBillingClientEmail(id: string, emailId: string): Promise<void> {
  await api.delete(`/billing/clients/${id}/emails/${emailId}`);
}
