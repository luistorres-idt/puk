import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingClientAccount, Invoice, InvoiceDetail } from '@puk/contracts';
import * as billingApi from './api.js';
import { useBilling } from './useBilling.js';

vi.mock('./api.js', () => ({
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  recordInvoicePayment: vi.fn(),
  deleteInvoicePayment: vi.fn(),
  listBillingClients: vi.fn(),
  updateBillingClient: vi.fn(),
  addBillingClientEmail: vi.fn(),
  removeBillingClientEmail: vi.fn(),
}));

const invoiceSummary: Invoice = {
  id: '00000000-0000-4000-8000-000000000010',
  folio: 'FAC-001',
  clientId: '00000000-0000-4000-8000-000000000001',
  client: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Acme',
    legalName: 'Acme S.A.',
    platformClient: 'acme-plat',
    accountStatus: 'ACTIVE',
  },
  invoiceType: 'MONTHLY',
  paymentStatus: 'UNPAID',
  totalAmount: 1000,
  paidAmount: 400,
  balanceDue: 600,
  currency: 'MXN',
  issuedAt: '2026-11-01T00:00:00.000Z',
  dueAt: '2026-11-21T00:00:00.000Z',
  paidAt: null,
  isOverdue: false,
  notes: null,
  paymentsCount: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const invoiceDetail: InvoiceDetail = {
  ...invoiceSummary,
  payments: [],
};

const billingClient: BillingClientAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  clientSheetId: 'C1',
  name: 'Acme',
  legalName: 'Acme S.A.',
  platformClient: 'acme-plat',
  contactPhone: '6621234567',
  accountStatus: 'ACTIVE',
  suspendedAt: null,
  paymentPromiseDate: null,
  emails: [],
  totalDebt: 600,
  activeInvoicesCount: 1,
  totalInvoicesCount: 1,
};

describe('useBilling composable', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(billingApi.listInvoices).mockResolvedValue([invoiceSummary]);
    vi.mocked(billingApi.listBillingClients).mockResolvedValue([billingClient]);
  });

  it('loads invoices and client accounts together', async () => {
    const state = useBilling();
    await state.loadAll();
    expect(state.invoices.value).toEqual([invoiceSummary]);
    expect(state.clients.value).toEqual([billingClient]);
    expect(state.error.value).toBeNull();
  });

  it('records payment and refreshes invoice detail and summaries', async () => {
    const paidDetail: InvoiceDetail = {
      ...invoiceDetail,
      paymentStatus: 'PAID',
      paidAmount: 1000,
      balanceDue: 0,
      paidAt: '2026-11-12T00:00:00.000Z',
    };
    vi.mocked(billingApi.recordInvoicePayment).mockResolvedValue(paidDetail);

    const state = useBilling();
    const result = await state.recordPayment(invoiceSummary.id, {
      amount: 600,
      paidAt: '2026-11-12T00:00:00.000Z',
    });

    expect(result?.paymentStatus).toBe('PAID');
    expect(state.selectedInvoice.value?.balanceDue).toBe(0);
    expect(billingApi.listInvoices).toHaveBeenCalledOnce();
    expect(billingApi.listBillingClients).toHaveBeenCalledOnce();
  });

  it('updates client account in place', async () => {
    const suspended: BillingClientAccount = {
      ...billingClient,
      accountStatus: 'SUSPENDED',
      suspendedAt: '2026-11-18T00:00:00.000Z',
    };
    vi.mocked(billingApi.updateBillingClient).mockResolvedValue(suspended);

    const state = useBilling();
    await state.loadClients();
    const updated = await state.updateClientAccount(billingClient.id, {
      accountStatus: 'SUSPENDED',
    });

    expect(updated?.accountStatus).toBe('SUSPENDED');
    expect(state.clients.value[0]?.suspendedAt).toBe('2026-11-18T00:00:00.000Z');
  });
});
