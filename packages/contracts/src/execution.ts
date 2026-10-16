import * as v from 'valibot';
import {
  MAX_DISCREPANCY_DESCRIPTION_LENGTH,
  MAX_ORDER_NOTES_LENGTH,
  MAX_OBSERVED_SNAPSHOT_VALUE_LENGTH,
} from './validation-limits.js';

export const MIN_REQUIRED_EVIDENCE_PHOTOS = 10;

export const ChecklistCategorySchema = v.picklist([
  'DASHBOARD',
  'WINDOWS',
  'ACCESSORIES',
  'TRIMS',
  'BODYWORK',
]);
export type ChecklistCategory = v.InferOutput<typeof ChecklistCategorySchema>;

export const ChecklistConditionSchema = v.picklist(['GOOD', 'BAD', 'NOT_APPLICABLE']);
export type ChecklistCondition = v.InferOutput<typeof ChecklistConditionSchema>;

export const SaveChecklistItemSchema = v.pipe(
  v.object({
    category: ChecklistCategorySchema,
    condition: ChecklistConditionSchema,
    notes: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(MAX_ORDER_NOTES_LENGTH)))),
  }),
  v.check((item) => {
    if (item.condition === 'BAD') {
      return typeof item.notes === 'string' && item.notes.trim().length > 0;
    }
    return true;
  }, 'Las observaciones son obligatorias cuando el estado es Mal'),
);
export type SaveChecklistItem = v.InferOutput<typeof SaveChecklistItemSchema>;

export const SaveChecklistSchema = v.pipe(
  v.object({
    items: v.pipe(
      v.array(SaveChecklistItemSchema),
      v.maxLength(ChecklistCategorySchema.options.length),
    ),
  }),
  v.check(
    ({ items }) => new Set(items.map(({ category }) => category)).size === items.length,
    'Las categorías del checklist no se pueden repetir',
  ),
);
export type SaveChecklist = v.InferOutput<typeof SaveChecklistSchema>;

export const ReportDiscrepancySchema = v.object({
  description: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.maxLength(MAX_DISCREPANCY_DESCRIPTION_LENGTH),
  ),
  observedSnapshot: v.optional(
    v.record(v.string(), v.pipe(v.string(), v.maxLength(MAX_OBSERVED_SNAPSHOT_VALUE_LENGTH))),
  ),
  type: v.picklist(['IMEI', 'ID', 'SERIAL', 'UNIT', 'OTHER']),
});
export type ReportDiscrepancy = v.InferOutput<typeof ReportDiscrepancySchema>;

export const UpdateExecutionNotesSchema = v.object({
  notes: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(MAX_ORDER_NOTES_LENGTH))),
});
export type UpdateExecutionNotes = v.InferOutput<typeof UpdateExecutionNotesSchema>;

export const FailAppointmentSchema = v.object({
  failedReason: v.pipe(v.string(), v.nonEmpty()),
});
export type FailAppointment = v.InferOutput<typeof FailAppointmentSchema>;

export const RequireCorrectionSchema = v.object({
  notes: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(MAX_ORDER_NOTES_LENGTH)))),
});
export type RequireCorrection = v.InferOutput<typeof RequireCorrectionSchema>;
