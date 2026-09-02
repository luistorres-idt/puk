import * as v from 'valibot';

export const ChecklistCategorySchema = v.picklist([
  'DASHBOARD',
  'WINDOWS',
  'ACCESSORIES',
  'TRIMS',
  'BODYWORK',
]);
export type ChecklistCategory = v.InferOutput<typeof ChecklistCategorySchema>;

export const ChecklistConditionSchema = v.picklist([
  'GOOD',
  'BAD',
  'NOT_APPLICABLE',
]);
export type ChecklistCondition = v.InferOutput<typeof ChecklistConditionSchema>;

export const SaveChecklistItemSchema = v.pipe(
  v.object({
    category: ChecklistCategorySchema,
    condition: ChecklistConditionSchema,
    notes: v.optional(v.nullable(v.string())),
  }),
  v.check((item) => {
    if (item.condition === 'BAD') {
      return typeof item.notes === 'string' && item.notes.trim().length > 0;
    }
    return true;
  }, 'Las observaciones son obligatorias cuando el estado es Mal'),
);
export type SaveChecklistItem = v.InferOutput<typeof SaveChecklistItemSchema>;

export const SaveChecklistSchema = v.object({
  items: v.array(SaveChecklistItemSchema),
});
export type SaveChecklist = v.InferOutput<typeof SaveChecklistSchema>;

export const ReportDiscrepancySchema = v.object({
  description: v.pipe(v.string(), v.nonEmpty()),
  observedSnapshot: v.optional(v.record(v.string(), v.string())),
  type: v.picklist(['IMEI', 'ID', 'SERIAL', 'UNIT', 'OTHER']),
});
export type ReportDiscrepancy = v.InferOutput<typeof ReportDiscrepancySchema>;

export const PresignEvidenceSchema = v.object({
  mimeType: v.picklist(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type PresignEvidence = v.InferOutput<typeof PresignEvidenceSchema>;

export const CompleteEvidenceSchema = v.object({
  checksum: v.optional(v.string()),
  height: v.optional(v.number()),
  width: v.optional(v.number()),
});
export type CompleteEvidence = v.InferOutput<typeof CompleteEvidenceSchema>;

export const PresignSignatureSchema = v.object({
  sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type PresignSignature = v.InferOutput<typeof PresignSignatureSchema>;

export const CompleteSignatureSchema = v.object({
  signerName: v.pipe(v.string(), v.nonEmpty()),
});
export type CompleteSignature = v.InferOutput<typeof CompleteSignatureSchema>;

export const FailAppointmentSchema = v.object({
  failedReason: v.pipe(v.string(), v.nonEmpty()),
});
export type FailAppointment = v.InferOutput<typeof FailAppointmentSchema>;

export const RequireCorrectionSchema = v.object({
  notes: v.pipe(v.string(), v.nonEmpty()),
});
export type RequireCorrection = v.InferOutput<typeof RequireCorrectionSchema>;
