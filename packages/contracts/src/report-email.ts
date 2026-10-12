import * as v from 'valibot';
import { ClientSchema } from './clients.js';

const id = v.pipe(v.string(), v.uuid());
export const SendReportEmailSchema = v.strictObject({
  reportId: id,
  recipientIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(20),
    v.check((ids) => new Set(ids).size === ids.length, 'Select each recipient only once.'),
  ),
});
export const ReportEmailRecipientsSchema = v.object({
  client: v.nullable(ClientSchema),
  configured: v.boolean(),
});
export const ReportEmailResultSchema = v.object({
  reportId: id,
  version: v.number(),
  attemptId: id,
  status: v.picklist(['SUCCESS', 'PARTIAL_FAILURE', 'FAILURE']),
  results: v.array(
    v.object({
      recipientId: id,
      email: v.string(),
      status: v.picklist(['SENT', 'FAILED']),
      messageId: v.optional(v.string()),
      failureCode: v.optional(v.picklist(['DELIVERY_UNCONFIRMED'])),
    }),
  ),
});
export type SendReportEmail = v.InferInput<typeof SendReportEmailSchema>;
export type ReportEmailRecipients = v.InferOutput<typeof ReportEmailRecipientsSchema>;
export type ReportEmailResult = v.InferOutput<typeof ReportEmailResultSchema>;
