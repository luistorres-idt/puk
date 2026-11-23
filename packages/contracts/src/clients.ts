import * as v from 'valibot';

const clientName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));
const clientSheetId = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));
const email = v.pipe(v.string(), v.trim(), v.email(), v.maxLength(254), v.toLowerCase());
const id = v.pipe(v.string(), v.uuid());

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

const validIsoDate = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.check((value) => !Number.isNaN(Date.parse(value)), 'Ingresa una fecha válida.'),
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

export const ClientAccountStatusSchema = v.picklist([
  'ACTIVE',
  'SUSPENDED',
  'PAYMENT_PROMISE',
  'PAYMENT_IN_PROGRESS',
]);

export const CLIENT_ACCOUNT_STATUS_LABELS: Record<ClientAccountStatus, string> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  PAYMENT_PROMISE: 'Promesa de pago',
  PAYMENT_IN_PROGRESS: 'En proceso de pago',
};

const clientAccountFields = {
  legalName: optionalNullableString(250),
  platformClient: optionalNullableString(200),
  contactPhone: optionalNullableString(50),
  accountStatus: v.optional(ClientAccountStatusSchema),
  paymentPromiseDate: optionalNullableIsoDate,
};

export const CreateClientSchema = v.pipe(
  v.strictObject({
    clientSheetId: v.optional(clientSheetId),
    name: clientName,
    ...clientAccountFields,
  }),
  v.check(
    (input) =>
      input.accountStatus !== 'PAYMENT_PROMISE' ||
      (input.paymentPromiseDate !== undefined && input.paymentPromiseDate !== null),
    'La fecha de promesa de pago es obligatoria cuando el estatus de cuenta es Promesa de pago.',
  ),
);

export const UpdateClientSchema = v.pipe(
  v.strictObject({
    name: v.optional(clientName),
    ...clientAccountFields,
  }),
  v.check(
    (input) =>
      input.name !== undefined ||
      input.legalName !== undefined ||
      input.platformClient !== undefined ||
      input.contactPhone !== undefined ||
      input.accountStatus !== undefined ||
      input.paymentPromiseDate !== undefined,
    'Debes proporcionar al menos un campo para actualizar.',
  ),
  v.check(
    (input) =>
      input.accountStatus !== 'PAYMENT_PROMISE' ||
      (input.paymentPromiseDate !== undefined && input.paymentPromiseDate !== null),
    'La fecha de promesa de pago es obligatoria cuando el estatus de cuenta es Promesa de pago.',
  ),
);

export const SaveClientEmailSchema = v.strictObject({ email });
export const ClientEmailParamsSchema = v.object({ id, emailId: id });
export const ClientEmailSchema = v.object({ id, email });
export const ClientSchema = v.object({
  id,
  clientSheetId,
  name: clientName,
  legalName: v.nullable(v.string()),
  platformClient: v.nullable(v.string()),
  contactPhone: v.nullable(v.string()),
  accountStatus: ClientAccountStatusSchema,
  suspendedAt: v.nullable(v.string()),
  paymentPromiseDate: v.nullable(v.string()),
  emails: v.array(ClientEmailSchema),
});

export type ClientAccountStatus = v.InferOutput<typeof ClientAccountStatusSchema>;
export type CreateClient = v.InferInput<typeof CreateClientSchema>;
export type UpdateClient = v.InferInput<typeof UpdateClientSchema>;
export type SaveClientEmail = v.InferInput<typeof SaveClientEmailSchema>;
export type ClientEmail = v.InferOutput<typeof ClientEmailSchema>;
export type Client = v.InferOutput<typeof ClientSchema>;
