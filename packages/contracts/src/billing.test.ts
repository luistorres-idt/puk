import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  CreateInvoiceSchema,
  InvoiceListQuerySchema,
  RecordInvoicePaymentSchema,
  UpdateBillingClientAccountSchema,
  UpdateInvoiceSchema,
} from './billing.js';
import { CreateClientSchema, UpdateClientSchema } from './clients.js';
import { UserRoleSchema } from './auth.js';

const clientId = '00000000-0000-4000-8000-000000000001';

describe('billing and extended client contracts', () => {
  it('accepts BILLING as a valid user role', () => {
    expect(v.parse(UserRoleSchema, 'BILLING')).toBe('BILLING');
  });

  it('validates invoice creation with optional nullable type and adjustable due date', () => {
    const minimal = v.parse(CreateInvoiceSchema, {
      folio: ' FAC-001 ',
      clientId,
      totalAmount: 1500.5,
      issuedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(minimal).toEqual({
      folio: 'FAC-001',
      clientId,
      totalAmount: 1500.5,
      issuedAt: '2026-11-01T00:00:00.000Z',
    });

    const typed = v.parse(CreateInvoiceSchema, {
      folio: 'FAC-002',
      clientId,
      invoiceType: 'MONTHLY',
      totalAmount: 3200,
      issuedAt: '2026-11-01T00:00:00.000Z',
      dueAt: '2026-11-25T00:00:00.000Z',
      notes: '  ',
    });
    expect(typed.invoiceType).toBe('MONTHLY');
    expect(typed.notes).toBeNull();
  });

  it('rejects invalid amounts, inverted dates, and unknown invoice types', () => {
    expect(
      v.safeParse(CreateInvoiceSchema, {
        folio: 'FAC-003',
        clientId,
        totalAmount: 0,
        issuedAt: '2026-11-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(CreateInvoiceSchema, {
        folio: 'FAC-003',
        clientId,
        totalAmount: 10.123,
        issuedAt: '2026-11-01T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(CreateInvoiceSchema, {
        folio: 'FAC-003',
        clientId,
        totalAmount: 100,
        issuedAt: '2026-11-10T00:00:00.000Z',
        dueAt: '2026-11-05T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(CreateInvoiceSchema, {
        folio: 'FAC-003',
        clientId,
        invoiceType: 'OTHER',
        totalAmount: 100,
        issuedAt: '2026-11-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('requires at least one field when updating an invoice or billing client account', () => {
    expect(v.safeParse(UpdateInvoiceSchema, {}).success).toBe(false);
    expect(v.safeParse(UpdateBillingClientAccountSchema, {}).success).toBe(false);
  });

  it('requires paymentPromiseDate when setting accountStatus to PAYMENT_PROMISE', () => {
    expect(
      v.safeParse(UpdateBillingClientAccountSchema, {
        accountStatus: 'PAYMENT_PROMISE',
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(UpdateBillingClientAccountSchema, {
        accountStatus: 'PAYMENT_PROMISE',
        paymentPromiseDate: null,
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(UpdateBillingClientAccountSchema, {
        accountStatus: 'PAYMENT_PROMISE',
        paymentPromiseDate: '2026-11-30T00:00:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      v.safeParse(CreateClientSchema, {
        name: 'Cliente',
        accountStatus: 'PAYMENT_PROMISE',
      }).success,
    ).toBe(false);

    expect(
      v.safeParse(UpdateClientSchema, {
        accountStatus: 'PAYMENT_PROMISE',
        paymentPromiseDate: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('validates payment recording and list query filters', () => {
    expect(
      v.parse(RecordInvoicePaymentSchema, {
        amount: 500,
        paidAt: '2026-11-15T12:00:00.000Z',
        reference: ' SPEI-123 ',
        notes: '',
      }),
    ).toEqual({
      amount: 500,
      paidAt: '2026-11-15T12:00:00.000Z',
      reference: 'SPEI-123',
      notes: null,
    });

    expect(
      v.parse(InvoiceListQuerySchema, {
        paymentStatus: 'UNPAID',
        overdueOnly: 'true',
        search: ' FAC ',
      }),
    ).toEqual({
      paymentStatus: 'UNPAID',
      overdueOnly: true,
      search: 'FAC',
    });
  });
});
