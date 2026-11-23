import type { Client, ClientAccountStatus } from '@puk/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

export const clientSelection = {
  id: true,
  clientSheetId: true,
  name: true,
  legalName: true,
  platformClient: true,
  contactPhone: true,
  accountStatus: true,
  suspendedAt: true,
  paymentPromiseDate: true,
  emails: { select: { id: true, email: true }, orderBy: { email: 'asc' as const } },
} satisfies Prisma.ClientSelect;

export type SelectedClientRecord = Prisma.ClientGetPayload<{ select: typeof clientSelection }>;

export interface ClientAccountPatch {
  legalName?: string | null | undefined;
  platformClient?: string | null | undefined;
  contactPhone?: string | null | undefined;
  accountStatus?: ClientAccountStatus | undefined;
  paymentPromiseDate?: string | null | undefined;
}

export function serializeClient(record: SelectedClientRecord): Client {
  return {
    id: record.id,
    clientSheetId: record.clientSheetId,
    name: record.name,
    legalName: record.legalName,
    platformClient: record.platformClient,
    contactPhone: record.contactPhone,
    accountStatus: record.accountStatus,
    suspendedAt: record.suspendedAt ? record.suspendedAt.toISOString() : null,
    paymentPromiseDate: record.paymentPromiseDate ? record.paymentPromiseDate.toISOString() : null,
    emails: record.emails,
  };
}

export function buildClientAccountUpdateData(
  current: Pick<SelectedClientRecord, 'accountStatus' | 'suspendedAt' | 'paymentPromiseDate'>,
  input: ClientAccountPatch,
  now = new Date(),
): Prisma.ClientUpdateInput {
  const nextStatus = input.accountStatus ?? current.accountStatus;
  const nextPromiseDate =
    input.paymentPromiseDate !== undefined
      ? input.paymentPromiseDate === null
        ? null
        : new Date(input.paymentPromiseDate)
      : current.paymentPromiseDate;

  if (nextStatus === 'PAYMENT_PROMISE' && nextPromiseDate === null) {
    throw new AppError(
      400,
      'PAYMENT_PROMISE_DATE_REQUIRED',
      'La fecha de promesa de pago es obligatoria cuando el estatus de cuenta es Promesa de pago.',
    );
  }

  const data: Prisma.ClientUpdateInput = {};
  if (input.legalName !== undefined) data.legalName = normalizeNullableText(input.legalName);
  if (input.platformClient !== undefined) {
    data.platformClient = normalizeNullableText(input.platformClient);
  }
  if (input.contactPhone !== undefined) {
    data.contactPhone = normalizeNullableText(input.contactPhone);
  }
  if (input.paymentPromiseDate !== undefined) {
    data.paymentPromiseDate = nextPromiseDate;
  }
  if (input.accountStatus !== undefined) {
    data.accountStatus = input.accountStatus;
    if (input.accountStatus === 'SUSPENDED') {
      data.suspendedAt = current.accountStatus === 'SUSPENDED' ? (current.suspendedAt ?? now) : now;
    } else {
      data.suspendedAt = null;
    }
  }

  return data;
}

export function buildClientAccountCreateData(
  input: ClientAccountPatch,
  now = new Date(),
): Partial<Prisma.ClientCreateInput> {
  const status = input.accountStatus;
  const promiseDate =
    input.paymentPromiseDate !== undefined
      ? input.paymentPromiseDate === null
        ? null
        : new Date(input.paymentPromiseDate)
      : undefined;

  if (status === 'PAYMENT_PROMISE' && !promiseDate) {
    throw new AppError(
      400,
      'PAYMENT_PROMISE_DATE_REQUIRED',
      'La fecha de promesa de pago es obligatoria cuando el estatus de cuenta es Promesa de pago.',
    );
  }

  const data: Partial<Prisma.ClientCreateInput> = {};
  if (input.legalName !== undefined) data.legalName = normalizeNullableText(input.legalName);
  if (input.platformClient !== undefined) {
    data.platformClient = normalizeNullableText(input.platformClient);
  }
  if (input.contactPhone !== undefined) {
    data.contactPhone = normalizeNullableText(input.contactPhone);
  }
  if (promiseDate !== undefined) data.paymentPromiseDate = promiseDate;
  if (status !== undefined) {
    data.accountStatus = status;
    if (status === 'SUSPENDED') {
      data.suspendedAt = now;
    }
  }
  return data;
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
