import {
  DEFAULT_INVOICE_DUE_DAYS,
  type BillingClientAccount,
  type CreateInvoice,
  type Invoice,
  type InvoiceDetail,
  type InvoiceListQuery,
  type InvoicePayment,
  type RecordInvoicePayment,
  type SaveClientEmail,
  type UpdateBillingClientAccount,
  type UpdateInvoice,
} from '@puk/contracts';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import {
  buildClientAccountUpdateData,
  clientSelection,
  serializeClient,
} from '../clients/index.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const invoiceDetailSelection = {
  id: true,
  folio: true,
  clientId: true,
  invoiceType: true,
  paymentStatus: true,
  totalAmount: true,
  currency: true,
  issuedAt: true,
  dueAt: true,
  paidAt: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: {
      id: true,
      name: true,
      legalName: true,
      platformClient: true,
      accountStatus: true,
    },
  },
  payments: {
    orderBy: [{ paidAt: 'desc' as const }, { createdAt: 'desc' as const }],
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      paidAt: true,
      reference: true,
      notes: true,
      recordedById: true,
      createdAt: true,
      recordedBy: { select: { name: true } },
    },
  },
} satisfies Prisma.InvoiceSelect;

const billingClientSelection = {
  ...clientSelection,
  invoices: {
    where: { deletedAt: null },
    select: {
      paymentStatus: true,
      totalAmount: true,
      payments: { select: { amount: true } },
    },
  },
} satisfies Prisma.ClientSelect;

type InvoiceDetailRecord = Prisma.InvoiceGetPayload<{ select: typeof invoiceDetailSelection }>;
type BillingClientRecord = Prisma.ClientGetPayload<{ select: typeof billingClientSelection }>;

export class BillingService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listInvoices(query: InvoiceListQuery = {}): Promise<Invoice[]> {
    const now = new Date();
    const search = query.search?.trim();
    const where: Prisma.InvoiceWhereInput = {
      deletedAt: null,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.invoiceType ? { invoiceType: query.invoiceType } : {}),
      ...(query.overdueOnly ? { paymentStatus: 'UNPAID', dueAt: { lt: now } } : {}),
      ...(search
        ? {
            OR: [
              { folio: { contains: search, mode: 'insensitive' } },
              { client: { name: { contains: search, mode: 'insensitive' } } },
              { client: { legalName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const records = await this.prisma.invoice.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      select: invoiceDetailSelection,
    });

    return records.map((record) => serializeInvoiceSummary(record, now));
  }

  public async getInvoice(id: string): Promise<InvoiceDetail> {
    const record = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      select: invoiceDetailSelection,
    });
    if (!record) throw invoiceNotFound();
    return serializeInvoiceDetail(record);
  }

  public async createInvoice(actorUserId: string, input: CreateInvoice): Promise<InvoiceDetail> {
    const issuedAt = new Date(input.issuedAt);
    const dueAt = input.dueAt
      ? new Date(input.dueAt)
      : new Date(issuedAt.getTime() + DEFAULT_INVOICE_DUE_DAYS * MS_PER_DAY);

    if (dueAt.getTime() < issuedAt.getTime()) {
      throw new AppError(
        400,
        'INVALID_INVOICE_DATES',
        'La fecha de vencimiento no puede ser anterior a la fecha de facturación.',
      );
    }

    return this.mutate(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: input.clientId },
        select: { id: true },
      });
      if (!client) throw clientNotFound();

      const created = await tx.invoice.create({
        data: {
          folio: input.folio.trim(),
          clientId: input.clientId,
          invoiceType: input.invoiceType ?? null,
          paymentStatus: 'UNPAID',
          totalAmount: formatDecimal(input.totalAmount),
          currency: 'MXN',
          issuedAt,
          dueAt,
          paidAt: null,
          notes: normalizeNullableText(input.notes),
          createdById: actorUserId,
        },
        select: invoiceDetailSelection,
      });

      const detail = serializeInvoiceDetail(created);
      await this.audit(tx, actorUserId, 'INVOICE_CREATED', 'Invoice', created.id, null, detail);
      return detail;
    });
  }

  public async updateInvoice(
    actorUserId: string,
    id: string,
    input: UpdateInvoice,
  ): Promise<InvoiceDetail> {
    return this.mutate(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id, deletedAt: null },
        select: invoiceDetailSelection,
      });
      if (!existing) throw invoiceNotFound();

      if (input.clientId !== undefined && input.clientId !== existing.clientId) {
        const client = await tx.client.findUnique({
          where: { id: input.clientId },
          select: { id: true },
        });
        if (!client) throw clientNotFound();
      }

      const nextIssuedAt = input.issuedAt !== undefined ? new Date(input.issuedAt) : existing.issuedAt;
      const nextDueAt = input.dueAt !== undefined ? new Date(input.dueAt) : existing.dueAt;
      if (nextDueAt.getTime() < nextIssuedAt.getTime()) {
        throw new AppError(
          400,
          'INVALID_INVOICE_DATES',
          'La fecha de vencimiento no puede ser anterior a la fecha de facturación.',
        );
      }

      const paidCents = sumPaymentCents(existing.payments);
      const nextTotalCents =
        input.totalAmount !== undefined ? toCents(input.totalAmount) : toCents(existing.totalAmount);

      if (nextTotalCents < paidCents) {
        throw new AppError(
          400,
          'INVOICE_TOTAL_BELOW_PAID',
          'El total de la factura no puede ser menor al monto ya pagado.',
        );
      }

      const derived = deriveInvoicePaymentState(nextTotalCents, existing.payments);

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          ...(input.folio !== undefined ? { folio: input.folio.trim() } : {}),
          ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
          ...(input.invoiceType !== undefined ? { invoiceType: input.invoiceType } : {}),
          ...(input.totalAmount !== undefined
            ? { totalAmount: formatDecimal(input.totalAmount) }
            : {}),
          ...(input.issuedAt !== undefined ? { issuedAt: nextIssuedAt } : {}),
          ...(input.dueAt !== undefined ? { dueAt: nextDueAt } : {}),
          ...(input.notes !== undefined ? { notes: normalizeNullableText(input.notes) } : {}),
          paymentStatus: derived.paymentStatus,
          paidAt: derived.paidAt,
        },
        select: invoiceDetailSelection,
      });

      const before = serializeInvoiceDetail(existing);
      const after = serializeInvoiceDetail(updated);
      await this.audit(tx, actorUserId, 'INVOICE_UPDATED', 'Invoice', id, before, after);
      return after;
    });
  }

  public async deleteInvoice(actorUserId: string, id: string): Promise<{ deleted: true }> {
    return this.mutate(async (tx) => {
      const existing = await tx.invoice.findFirst({
        where: { id, deletedAt: null },
        select: invoiceDetailSelection,
      });
      if (!existing) throw invoiceNotFound();

      await tx.invoice.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.audit(
        tx,
        actorUserId,
        'INVOICE_DELETED',
        'Invoice',
        id,
        serializeInvoiceDetail(existing),
        null,
      );
      return { deleted: true };
    });
  }

  public async recordPayment(
    actorUserId: string,
    invoiceId: string,
    input: RecordInvoicePayment,
  ): Promise<InvoiceDetail> {
    return this.mutate(
      async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: { id: invoiceId, deletedAt: null },
          select: invoiceDetailSelection,
        });
        if (!existing) throw invoiceNotFound();

        const totalCents = toCents(existing.totalAmount);
        const paidCents = sumPaymentCents(existing.payments);
        const balanceCents = Math.max(0, totalCents - paidCents);
        const paymentCents = toCents(input.amount);

        if (balanceCents <= 0) {
          throw new AppError(
            409,
            'INVOICE_ALREADY_PAID',
            'La factura ya está pagada en su totalidad.',
          );
        }

        if (paymentCents > balanceCents) {
          throw new AppError(
            400,
            'PAYMENT_EXCEEDS_BALANCE',
            'El monto del pago excede el saldo pendiente de la factura.',
          );
        }

        const paidAt = new Date(input.paidAt);
        const createdPayment = await tx.invoicePayment.create({
          data: {
            invoiceId,
            amount: formatDecimal(input.amount),
            paidAt,
            reference: normalizeNullableText(input.reference),
            notes: normalizeNullableText(input.notes),
            recordedById: actorUserId,
          },
          select: { id: true, amount: true, paidAt: true },
        });

        const derived = deriveInvoicePaymentState(totalCents, [
          ...existing.payments,
          { amount: createdPayment.amount, paidAt: createdPayment.paidAt },
        ]);

        const updated = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            paymentStatus: derived.paymentStatus,
            paidAt: derived.paidAt,
          },
          select: invoiceDetailSelection,
        });

        const detail = serializeInvoiceDetail(updated);
        await this.audit(
          tx,
          actorUserId,
          'INVOICE_PAYMENT_RECORDED',
          'InvoicePayment',
          createdPayment.id,
          null,
          {
            invoiceId,
            paymentId: createdPayment.id,
            amount: fromCents(paymentCents),
            paidAt: paidAt.toISOString(),
            paymentStatus: detail.paymentStatus,
            balanceDue: detail.balanceDue,
          },
        );
        return detail;
      },
      { serializable: true },
    );
  }

  public async deletePayment(
    actorUserId: string,
    invoiceId: string,
    paymentId: string,
  ): Promise<InvoiceDetail> {
    return this.mutate(
      async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: { id: invoiceId, deletedAt: null },
          select: invoiceDetailSelection,
        });
        if (!existing) throw invoiceNotFound();

        const targetPayment = existing.payments.find((payment) => payment.id === paymentId);
        if (!targetPayment) {
          throw new AppError(
            404,
            'INVOICE_PAYMENT_NOT_FOUND',
            'El pago no existe para esta factura.',
          );
        }

        await tx.invoicePayment.delete({ where: { id: paymentId } });

        const remainingPayments = existing.payments.filter((payment) => payment.id !== paymentId);
        const derived = deriveInvoicePaymentState(toCents(existing.totalAmount), remainingPayments);

        const updated = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            paymentStatus: derived.paymentStatus,
            paidAt: derived.paidAt,
          },
          select: invoiceDetailSelection,
        });

        const detail = serializeInvoiceDetail(updated);
        await this.audit(
          tx,
          actorUserId,
          'INVOICE_PAYMENT_DELETED',
          'InvoicePayment',
          paymentId,
          {
            invoiceId,
            paymentId,
            amount: fromCents(toCents(targetPayment.amount)),
            paidAt: targetPayment.paidAt.toISOString(),
          },
          {
            invoiceId,
            paymentStatus: detail.paymentStatus,
            balanceDue: detail.balanceDue,
          },
        );
        return detail;
      },
      { serializable: true },
    );
  }

  public async listClientAccounts(): Promise<BillingClientAccount[]> {
    const records = await this.prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: billingClientSelection,
    });
    return records.map(serializeBillingClientAccount);
  }

  public async updateClientAccount(
    actorUserId: string,
    clientId: string,
    input: UpdateBillingClientAccount,
  ): Promise<BillingClientAccount> {
    return this.mutate(async (tx) => {
      const existing = await tx.client.findUnique({
        where: { id: clientId },
        select: billingClientSelection,
      });
      if (!existing) throw clientNotFound();

      const updateData = buildClientAccountUpdateData(existing, input);
      const updated = await tx.client.update({
        where: { id: clientId },
        data: updateData,
        select: billingClientSelection,
      });

      const before = serializeClient(existing);
      const after = serializeClient(updated);
      await this.audit(
        tx,
        actorUserId,
        'BILLING_CLIENT_ACCOUNT_UPDATED',
        'Client',
        clientId,
        before,
        after,
      );
      return serializeBillingClientAccount(updated);
    });
  }

  public async addClientEmail(actorUserId: string, clientId: string, input: SaveClientEmail) {
    return this.mutate(
      async (tx) => {
        const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true } });
        if (!client) throw clientNotFound();

        const email = await tx.clientEmail.create({
          data: { clientId, email: input.email.trim().toLowerCase() },
          select: { id: true, email: true },
        });
        await this.audit(tx, actorUserId, 'CLIENT_EMAIL_CREATED', 'ClientEmail', email.id, null, {
          clientId,
          ...email,
        });
        return email;
      },
      { conflictCode: 'CLIENT_EMAIL_ALREADY_EXISTS' },
    );
  }

  public async removeClientEmail(actorUserId: string, clientId: string, emailId: string) {
    return this.mutate(async (tx) => {
      const client = await tx.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!client) throw clientNotFound();

      const existing = await tx.clientEmail.findFirst({
        where: { id: emailId, clientId },
        select: { id: true, email: true },
      });
      if (!existing) {
        throw new AppError(404, 'CLIENT_EMAIL_NOT_FOUND', 'El correo no existe para este cliente.');
      }

      await tx.clientEmail.delete({ where: { id: emailId, clientId } });
      await this.audit(
        tx,
        actorUserId,
        'CLIENT_EMAIL_DELETED',
        'ClientEmail',
        emailId,
        { clientId, ...existing },
        null,
      );
      return { deleted: true };
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
  ) {
    await tx.auditLog.create({
      data: {
        action,
        actorUserId,
        entityType,
        entityId,
        ...(before !== null ? { before } : {}),
        ...(after !== null ? { after } : {}),
      },
    });
  }

  private async mutate<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { serializable?: boolean; conflictCode?: string } = {},
  ): Promise<T> {
    try {
      return options.serializable
        ? await this.prisma.$transaction(work, { isolationLevel: 'Serializable' })
        : await this.prisma.$transaction(work);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'P2002') {
        if (options.conflictCode === 'CLIENT_EMAIL_ALREADY_EXISTS') {
          throw new AppError(
            409,
            'CLIENT_EMAIL_ALREADY_EXISTS',
            'Este correo ya está registrado para el cliente.',
          );
        }
        throw new AppError(
          409,
          'INVOICE_FOLIO_ALREADY_EXISTS',
          'Ya existe una factura registrada con este folio.',
        );
      }
      if (code === 'P2025') {
        throw new AppError(404, 'BILLING_RECORD_NOT_FOUND', 'El registro solicitado ya no existe.');
      }
      throw error;
    }
  }
}

function deriveInvoicePaymentState(
  totalCents: number,
  payments: ReadonlyArray<{ amount: unknown; paidAt: Date }>,
): { paymentStatus: 'PAID' | 'UNPAID'; paidAt: Date | null } {
  const paidCents = sumPaymentCents(payments);
  if (paidCents >= totalCents && totalCents > 0) {
    const latestPaidAt = payments.reduce<Date | null>(
      (latest, item) => (latest === null || item.paidAt > latest ? item.paidAt : latest),
      null,
    );
    return { paymentStatus: 'PAID', paidAt: latestPaidAt };
  }
  return { paymentStatus: 'UNPAID', paidAt: null };
}

function serializeInvoiceSummary(record: InvoiceDetailRecord, now = new Date()): Invoice {
  const totalCents = toCents(record.totalAmount);
  const paidCents = sumPaymentCents(record.payments);
  const balanceCents = Math.max(0, totalCents - paidCents);
  const isOverdue = record.paymentStatus === 'UNPAID' && record.dueAt.getTime() < now.getTime();

  return {
    id: record.id,
    folio: record.folio,
    clientId: record.clientId,
    client: record.client,
    invoiceType: record.invoiceType,
    paymentStatus: record.paymentStatus,
    totalAmount: fromCents(totalCents),
    paidAmount: fromCents(paidCents),
    balanceDue: fromCents(balanceCents),
    currency: record.currency,
    issuedAt: record.issuedAt.toISOString(),
    dueAt: record.dueAt.toISOString(),
    paidAt: record.paidAt ? record.paidAt.toISOString() : null,
    isOverdue,
    notes: record.notes,
    paymentsCount: record.payments.length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeInvoiceDetail(record: InvoiceDetailRecord): InvoiceDetail {
  const summary = serializeInvoiceSummary(record);
  const payments: InvoicePayment[] = record.payments.map((payment) => ({
    id: payment.id,
    invoiceId: payment.invoiceId,
    amount: fromCents(toCents(payment.amount)),
    paidAt: payment.paidAt.toISOString(),
    reference: payment.reference,
    notes: payment.notes,
    recordedById: payment.recordedById,
    recordedByName: payment.recordedBy.name,
    createdAt: payment.createdAt.toISOString(),
  }));
  return { ...summary, payments };
}

function serializeBillingClientAccount(record: BillingClientRecord): BillingClientAccount {
  let totalDebtCents = 0;
  let activeInvoicesCount = 0;

  for (const invoice of record.invoices) {
    const totalCents = toCents(invoice.totalAmount);
    const paidCents = sumPaymentCents(invoice.payments);
    const balanceCents = Math.max(0, totalCents - paidCents);
    totalDebtCents += balanceCents;
    if (invoice.paymentStatus === 'UNPAID') {
      activeInvoicesCount += 1;
    }
  }

  return {
    ...serializeClient(record),
    totalDebt: fromCents(totalDebtCents),
    activeInvoicesCount,
    totalInvoicesCount: record.invoices.length,
  };
}

function toCents(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Math.round(numeric * 100);
}

function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function formatDecimal(amount: number): string {
  return amount.toFixed(2);
}

function sumPaymentCents(payments: ReadonlyArray<{ amount: unknown }>): number {
  return payments.reduce((sum, item) => sum + toCents(item.amount), 0);
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function invoiceNotFound(): AppError {
  return new AppError(404, 'INVOICE_NOT_FOUND', 'La factura no existe.');
}

function clientNotFound(): AppError {
  return new AppError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.');
}
