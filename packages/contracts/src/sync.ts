import * as v from 'valibot';

import { SyncStatusSchema } from './orders.js';

export const SyncOperationTypeSchema = v.picklist([
  'SHEET_EQUIPMENT_ASSIGNMENT',
  'SHEET_TECHNICAL_REPORT',
]);

export const SyncOperationsQuerySchema = v.object({
  from: v.optional(v.string()),
  operationType: v.optional(SyncOperationTypeSchema),
  page: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1))),
  pageSize: v.optional(
    v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(100)),
  ),
  search: v.optional(v.string()),
  status: v.optional(SyncStatusSchema),
  to: v.optional(v.string()),
});

export const UpdateTechnicalReportSyncScheduleSchema = v.object({
  cutoffWeekday: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
  syncTime: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
  syncWeekday: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
  timeZone: v.pipe(v.string(), v.nonEmpty()),
});

export type SyncOperationsQuery = v.InferOutput<typeof SyncOperationsQuerySchema>;
export type SyncOperationType = v.InferOutput<typeof SyncOperationTypeSchema>;
export type UpdateTechnicalReportSyncSchedule = v.InferOutput<
  typeof UpdateTechnicalReportSyncScheduleSchema
>;
