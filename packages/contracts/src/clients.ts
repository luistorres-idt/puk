import * as v from 'valibot';

const clientName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));
const clientSheetId = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));
const email = v.pipe(v.string(), v.trim(), v.email(), v.maxLength(254), v.toLowerCase());
const id = v.pipe(v.string(), v.uuid());

export const CreateClientSchema = v.strictObject({
  clientSheetId: v.optional(clientSheetId),
  name: clientName,
});
export const UpdateClientSchema = v.strictObject({ name: clientName });
export const SaveClientEmailSchema = v.strictObject({ email });
export const ClientEmailParamsSchema = v.object({ id, emailId: id });
export const ClientEmailSchema = v.object({ id, email });
export const ClientSchema = v.object({
  id,
  clientSheetId,
  name: clientName,
  emails: v.array(ClientEmailSchema),
});

export type CreateClient = v.InferInput<typeof CreateClientSchema>;
export type UpdateClient = v.InferInput<typeof UpdateClientSchema>;
export type SaveClientEmail = v.InferInput<typeof SaveClientEmailSchema>;
export type ClientEmail = v.InferOutput<typeof ClientEmailSchema>;
export type Client = v.InferOutput<typeof ClientSchema>;
