import * as v from 'valibot';
import { ClientAccountStatusSchema, ClientSchema } from './clients.js';

const id = v.pipe(v.string(), v.uuid());
const folio = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100));

const validIsoDate = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.check((value) => !Number.isNaN(Date.parse(value)), 'Ingresa una fecha válida.'),
);

const optionalNullableString = (maxLength: number) =>
  v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(maxLength),
        v.transform((value) => (value.length === 0 ? null : value)),
      ),
    ),
  );

const optionalNullableIsoDate = v.optional(
  v.nullable(
    v.union([
      v.pipe(
        v.string(),
        v.trim(),
        v.literal(''),
        v.transform(() => null),
      ),
      validIsoDate,
    ]),
  ),
);

const positiveMoneyAmount = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(0.01, 'El monto debe ser mayor a cero.'),
  v.maxValue(999_999_999.99),
  v.check(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
    'El monto solo puede tener hasta 2 decimales.',
  ),
);

export const DEFAULT_INVOICE_DUE_DAYS = 20;

export const InvoiceTypeSchema = v.picklist(['MONTHLY', 'TECHNICAL_SERVICE']);
export const InvoicePaymentStatusSchema = v.picklist(['UNPAID', 'PAID']);

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  MONTHLY: 'Mensualidades',
  TECHNICAL_SERVICE: 'Servicio técnico',
};

export const INVOICE_PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  UNPAID: 'No pagada',
  PAID: 'Pagada',
};

export const CreateInvoiceSchema = v.pipe(
  v.strictObject({
    folio,
    clientId: id,
    invoiceType: v.optional(v.nullable(InvoiceTypeSchema)),
    totalAmount: positiveMoneyAmount,
    issuedAt: validIsoDate,
    dueAt: v.optional(validIsoDate),
    notes: optionalNullableString(2000),
  }),
  v.check(
    (input) =>
      input.dueAt === undefined || Date.parse(input.dueAt) >= Date.parse(input.issuedAt),
    'La fecha de vencimiento no puede ser anterior a la fecha de facturación.',
  ),
);

export const UpdateInvoiceSchema = v.pipe(
  v.strictObject({
    folio: v.optional(folio),
    clientId: v.optional(id),
    invoiceType: v.optional(v.nullable(InvoiceTypeSchema)),
    totalAmount: v.optional(positiveMoneyAmount),
    issuedAt: v.optional(validIsoDate),
    dueAt: v.optional(validIsoDate),
    notes: optionalNullableString(2000),
  }),
  v.check(
    (input) =>
      input.folio !== undefined ||
      input.clientId !== undefined ||
      input.invoiceType !== undefined ||
      input.totalAmount !== undefined ||
      input.issuedAt !== undefined ||
      input.dueAt !== undefined ||
      input.notes !== undefined,
    'Debes proporcionar al menos un campo para actualizar la factura.',
  ),
  v.check(
    (input) =>
      input.issuedAt === undefined ||
      input.dueAt === undefined ||
      Date.parse(input.dueAt) >= Date.parse(input.issuedAt),
    'La fecha de vencimiento no puede ser anterior a la fecha de facturación.',
  ),
);

export const RecordInvoicePaymentSchema = v.strictObject({
  amount: positiveMoneyAmount,
  paidAt: validIsoDate,
  reference: optionalNullableString(200),
  notes: optionalNullableString(1000),
});

export const InvoicePaymentParamsSchema = v.object({
  id,
  paymentId: id,
});

export const InvoiceListQuerySchema = v.object({
  clientId: v.optional(id),
  paymentStatus: v.optional(InvoicePaymentStatusSchema),
  invoiceType: v.optional(InvoiceTypeSchema),
  overdueOnly: v.optional(
    v.pipe(
      v.picklist(['true', 'false']),
      v.transform((value) => value === 'true'),
    ),
  ),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
});

export const UpdateBillingClientAccountSchema = v.pipe(
  v.strictObject({
    legalName: optionalNullableString(250),
    platformClient: optionalNullableString(200),
    contactPhone: optionalNullableString(50),
    accountStatus: v.optional(ClientAccountStatusSchema),
    paymentPromiseDate: optionalNullableIsoDate,
  }),
  v.check(
    (input) =>
      input.legalName !== undefined ||
      input.platformClient !== undefined ||
      input.contactPhone !== undefined ||
      input.accountStatus !== undefined ||
      input.paymentPromiseDate !== undefined,
    'Debes proporcionar al menos un campo para actualizar la cuenta del cliente.',
  ),
  v.check(
    (input) =>
      input.accountStatus !== 'PAYMENT_PROMISE' ||
      (input.paymentPromiseDate !== undefined && input.paymentPromiseDate !== null),
    'La fecha de promesa de pago es obligatoria cuando el estatus de cuenta es Promesa de pago.',
  ),
);

export const InvoicePaymentSchema = v.object({
  id,
  invoiceId: id,
  amount: v.number(),
  paidAt: v.string(),
  reference: v.nullable(v.string()),
  notes: v.nullable(v.string()),
  recordedById: id,
  recordedByName: v.string(),
  createdAt: v.string(),
});

export const InvoiceClientSummarySchema = v.object({
  id,
  name: v.string(),
  legalName: v.nullable(v.string()),
  platformClient: v.nullable(v.string()),
  accountStatus: ClientAccountStatusSchema,
});

export const InvoiceSchema = v.object({
  id,
  folio: v.string(),
  clientId: id,
  client: InvoiceClientSummarySchema,
  invoiceType: v.nullable(InvoiceTypeSchema),
  paymentStatus: InvoicePaymentStatusSchema,
  totalAmount: v.number(),
  paidAmount: v.number(),
  balanceDue: v.number(),
  currency: v.string(),
  issuedAt: v.string(),
  dueAt: v.string(),
  paidAt: v.nullable(v.string()),
  isOverdue: v.boolean(),
  notes: v.nullable(v.string()),
  paymentsCount: v.number(),
  createdAt: v.string(),
  updatedAt: v.string(),
});

export const InvoiceDetailSchema = v.object({
  ...InvoiceSchema.entries,
  payments: v.array(InvoicePaymentSchema),
});

export const BillingClientAccountSchema = v.object({
  ...ClientSchema.entries,
  totalDebt: v.number(),
  activeInvoicesCount: v.number(),
  totalInvoicesCount: v.number(),
});

export type InvoiceType = v.InferOutput<typeof InvoiceTypeSchema>;
export type InvoicePaymentStatus = v.InferOutput<typeof InvoicePaymentStatusSchema>;
export type CreateInvoice = v.InferInput<typeof CreateInvoiceSchema>;
export type UpdateInvoice = v.InferInput<typeof UpdateInvoiceSchema>;
export type RecordInvoicePayment = v.InferInput<typeof RecordInvoicePaymentSchema>;
export type InvoiceListQuery = v.InferOutput<typeof InvoiceListQuerySchema>;
export type UpdateBillingClientAccount = v.InferInput<typeof UpdateBillingClientAccountSchema>;
export type InvoicePayment = v.InferOutput<typeof InvoicePaymentSchema>;
export type InvoiceClientSummary = v.InferOutput<typeof InvoiceClientSummarySchema>;
export type Invoice = v.InferOutput<typeof InvoiceSchema>;
export type InvoiceDetail = v.InferOutput<typeof InvoiceDetailSchema>;
export type BillingClientAccount = v.InferOutput<typeof BillingClientAccountSchema>;
