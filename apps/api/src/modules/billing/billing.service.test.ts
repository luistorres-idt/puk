import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { BillingService } from './billing.service.js';

const clientId = '00000000-0000-4000-8000-000000000001';
const invoiceId = '00000000-0000-4000-8000-000000000010';
const paymentId = '00000000-0000-4000-8000-000000000020';
const actorId = '00000000-0000-4000-8000-000000000099';

function makeInvoiceRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: invoiceId,
    folio: 'FAC-100',
    clientId,
    invoiceType: 'MONTHLY' as const,
    paymentStatus: 'UNPAID' as const,
    totalAmount: '1000.00',
    currency: 'MXN',
    issuedAt: new Date('2026-11-01T00:00:00.000Z'),
    dueAt: new Date('2026-11-21T00:00:00.000Z'),
    paidAt: null as Date | null,
    notes: null as string | null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    client: {
      id: clientId,
      name: 'Acme',
      legalName: 'Acme S.A. de C.V.',
      platformClient: 'acme-plat',
      accountStatus: 'ACTIVE' as const,
    },
    payments: [] as Array<{
      id: string;
      invoiceId: string;
      amount: string;
      paidAt: Date;
      reference: string | null;
      notes: string | null;
      recordedById: string;
      createdAt: Date;
      recordedBy: { name: string };
    }>,
    ...overrides,
  };
}

function makeClientRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: clientId,
    clientSheetId: 'C1',
    name: 'Acme',
    legalName: 'Acme S.A. de C.V.',
    platformClient: 'acme-plat',
    contactPhone: '6621234567',
    accountStatus: 'ACTIVE' as const,
    suspendedAt: null as Date | null,
    paymentPromiseDate: null as Date | null,
    emails: [{ id: 'email-1', email: 'facturas@acme.com' }],
    invoices: [
      {
        paymentStatus: 'UNPAID' as const,
        totalAmount: '1000.00',
        payments: [{ amount: '400.00' }],
      },
      {
        paymentStatus: 'PAID' as const,
        totalAmount: '500.00',
        payments: [{ amount: '500.00' }],
      },
    ],
    ...overrides,
  };
}

function setup() {
  const tx = {
    client: {
      findUnique: vi.fn().mockResolvedValue(makeClientRecord()),
      findMany: vi.fn().mockResolvedValue([makeClientRecord()]),
      update: vi.fn().mockResolvedValue(makeClientRecord()),
    },
    clientEmail: {
      create: vi.fn().mockResolvedValue({ id: 'email-2', email: 'cobranza@acme.com' }),
      findFirst: vi.fn().mockResolvedValue({ id: 'email-1', email: 'facturas@acme.com' }),
      delete: vi.fn().mockResolvedValue({}),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([makeInvoiceRecord()]),
      findFirst: vi.fn().mockResolvedValue(makeInvoiceRecord()),
      create: vi.fn().mockResolvedValue(makeInvoiceRecord()),
      update: vi.fn().mockResolvedValue(makeInvoiceRecord()),
    },
    invoicePayment: {
      create: vi.fn().mockResolvedValue({
        id: paymentId,
        amount: '1000.00',
        paidAt: new Date('2026-11-10T00:00:00.000Z'),
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
  };

  return {
    tx,
    prisma,
    service: new BillingService(prisma as unknown as PrismaClient),
  };
}

describe('BillingService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('defaults dueAt to issuedAt + 20 days when creating an invoice without dueAt', async () => {
    await ctx.service.createInvoice(actorId, {
      folio: ' FAC-100 ',
      clientId,
      invoiceType: 'MONTHLY',
      totalAmount: 1000,
      issuedAt: '2026-11-01T00:00:00.000Z',
    });

    expect(ctx.tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folio: 'FAC-100',
          paymentStatus: 'UNPAID',
          issuedAt: new Date('2026-11-01T00:00:00.000Z'),
          dueAt: new Date('2026-11-21T00:00:00.000Z'),
        }),
      }),
    );
    expect(ctx.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'INVOICE_CREATED', entityType: 'Invoice' }),
      }),
    );
  });

  it('allows custom dueAt and maps duplicate folio errors to 409', async () => {
    ctx.tx.invoice.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      ctx.service.createInvoice(actorId, {
        folio: 'FAC-100',
        clientId,
        totalAmount: 500,
        issuedAt: '2026-11-01T00:00:00.000Z',
        dueAt: '2026-12-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'INVOICE_FOLIO_ALREADY_EXISTS' });
  });

  it('records partial payments keeping UNPAID and auto-marks PAID when total is covered', async () => {
    const firstPaidAt = new Date('2026-11-05T00:00:00.000Z');
    ctx.tx.invoicePayment.create.mockResolvedValueOnce({
      id: paymentId,
      amount: '400.00',
      paidAt: firstPaidAt,
    });
    ctx.tx.invoice.update.mockResolvedValueOnce(
      makeInvoiceRecord({
        paymentStatus: 'UNPAID',
        paidAt: null,
        payments: [
          {
            id: paymentId,
            invoiceId,
            amount: '400.00',
            paidAt: firstPaidAt,
            reference: 'REF-1',
            notes: null,
            recordedById: actorId,
            createdAt: firstPaidAt,
            recordedBy: { name: 'Facturacion' },
          },
        ],
      }),
    );

    const partial = await ctx.service.recordPayment(actorId, invoiceId, {
      amount: 400,
      paidAt: firstPaidAt.toISOString(),
      reference: 'REF-1',
    });
    expect(partial.paymentStatus).toBe('UNPAID');
    expect(partial.paidAmount).toBe(400);
    expect(partial.balanceDue).toBe(600);
    expect(ctx.tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { paymentStatus: 'UNPAID', paidAt: null },
      }),
    );

    const finalPaidAt = new Date('2026-11-12T00:00:00.000Z');
    ctx.tx.invoice.findFirst.mockResolvedValueOnce(
      makeInvoiceRecord({
        payments: [
          {
            id: paymentId,
            invoiceId,
            amount: '400.00',
            paidAt: firstPaidAt,
            reference: 'REF-1',
            notes: null,
            recordedById: actorId,
            createdAt: firstPaidAt,
            recordedBy: { name: 'Facturacion' },
          },
        ],
      }),
    );
    ctx.tx.invoicePayment.create.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000021',
      amount: '600.00',
      paidAt: finalPaidAt,
    });
    ctx.tx.invoice.update.mockResolvedValueOnce(
      makeInvoiceRecord({
        paymentStatus: 'PAID',
        paidAt: finalPaidAt,
        payments: [
          {
            id: '00000000-0000-4000-8000-000000000021',
            invoiceId,
            amount: '600.00',
            paidAt: finalPaidAt,
            reference: 'REF-2',
            notes: null,
            recordedById: actorId,
            createdAt: finalPaidAt,
            recordedBy: { name: 'Facturacion' },
          },
          {
            id: paymentId,
            invoiceId,
            amount: '400.00',
            paidAt: firstPaidAt,
            reference: 'REF-1',
            notes: null,
            recordedById: actorId,
            createdAt: firstPaidAt,
            recordedBy: { name: 'Facturacion' },
          },
        ],
      }),
    );

    const paid = await ctx.service.recordPayment(actorId, invoiceId, {
      amount: 600,
      paidAt: finalPaidAt.toISOString(),
      reference: 'REF-2',
    });
    expect(paid.paymentStatus).toBe('PAID');
    expect(paid.paidAmount).toBe(1000);
    expect(paid.balanceDue).toBe(0);
    expect(ctx.tx.invoice.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { paymentStatus: 'PAID', paidAt: finalPaidAt },
      }),
    );
  });

  it('rejects overpayments and lowering totalAmount below already paid amount', async () => {
    await expect(
      ctx.service.recordPayment(actorId, invoiceId, {
        amount: 1200,
        paidAt: '2026-11-10T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'PAYMENT_EXCEEDS_BALANCE' });

    ctx.tx.invoice.findFirst.mockResolvedValueOnce(
      makeInvoiceRecord({
        payments: [
          {
            id: paymentId,
            invoiceId,
            amount: '600.00',
            paidAt: new Date('2026-11-05T00:00:00.000Z'),
            reference: null,
            notes: null,
            recordedById: actorId,
            createdAt: new Date('2026-11-05T00:00:00.000Z'),
            recordedBy: { name: 'Facturacion' },
          },
        ],
      }),
    );

    await expect(
      ctx.service.updateInvoice(actorId, invoiceId, { totalAmount: 500 }),
    ).rejects.toMatchObject({ status: 400, code: 'INVOICE_TOTAL_BELOW_PAID' });
  });

  it('reverts invoice status to UNPAID when deleting a payment', async () => {
    const paidAt = new Date('2026-11-10T00:00:00.000Z');
    ctx.tx.invoice.findFirst.mockResolvedValueOnce(
      makeInvoiceRecord({
        paymentStatus: 'PAID',
        paidAt,
        payments: [
          {
            id: paymentId,
            invoiceId,
            amount: '1000.00',
            paidAt,
            reference: null,
            notes: null,
            recordedById: actorId,
            createdAt: paidAt,
            recordedBy: { name: 'Facturacion' },
          },
        ],
      }),
    );
    ctx.tx.invoice.update.mockResolvedValueOnce(
      makeInvoiceRecord({ paymentStatus: 'UNPAID', paidAt: null, payments: [] }),
    );

    const updated = await ctx.service.deletePayment(actorId, invoiceId, paymentId);
    expect(updated.paymentStatus).toBe('UNPAID');
    expect(updated.paidAt).toBeNull();
    expect(ctx.tx.invoicePayment.delete).toHaveBeenCalledWith({ where: { id: paymentId } });
  });

  it('computes client totalDebt and active unpaid invoice count', async () => {
    const accounts = await ctx.service.listClientAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: clientId,
      totalDebt: 600,
      activeInvoicesCount: 1,
      totalInvoicesCount: 2,
    });
  });

  it('auto-sets suspendedAt when suspending and clears it when reactivating', async () => {
    await ctx.service.updateClientAccount(actorId, clientId, { accountStatus: 'SUSPENDED' });
    expect(ctx.tx.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountStatus: 'SUSPENDED',
          suspendedAt: expect.any(Date),
        }),
      }),
    );

    ctx.tx.client.findUnique.mockResolvedValueOnce(
      makeClientRecord({
        accountStatus: 'SUSPENDED',
        suspendedAt: new Date('2026-11-10T00:00:00.000Z'),
      }),
    );
    await ctx.service.updateClientAccount(actorId, clientId, { accountStatus: 'ACTIVE' });
    expect(ctx.tx.client.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountStatus: 'ACTIVE',
          suspendedAt: null,
        }),
      }),
    );
  });
});
