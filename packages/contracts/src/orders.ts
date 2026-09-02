import * as v from 'valibot';

export const OrderServiceTypeSchema = v.picklist([
  'INSTALLATION',
  'REVIEW',
  'UNINSTALLATION',
  'FAILED_APPOINTMENT',
]);
export type OrderServiceType = v.InferOutput<typeof OrderServiceTypeSchema>;

export const OrderStatusSchema = v.picklist([
  'DRAFT',
  'ASSIGNED',
  'IN_PROGRESS',
  'REQUIRES_CORRECTION',
  'COMPLETED',
  'FAILED_APPOINTMENT',
  'CANCELLED',
]);
export type OrderStatus = v.InferOutput<typeof OrderStatusSchema>;

export const UnitStatusSchema = v.picklist(['PENDING', 'IN_PROGRESS', 'COMPLETED']);
export type UnitStatus = v.InferOutput<typeof UnitStatusSchema>;

export const EquipmentVerificationStatusSchema = v.picklist([
  'PENDING',
  'MATCHED',
  'DISCREPANCY_REPORTED',
]);
export type EquipmentVerificationStatus = v.InferOutput<
  typeof EquipmentVerificationStatusSchema
>;

export const SyncStatusSchema = v.picklist([
  'PENDING',
  'PROCESSING',
  'SYNCED',
  'FAILED',
]);
export type SyncStatus = v.InferOutput<typeof SyncStatusSchema>;

export const CreateOrderSchema = v.object({
  clientNameSnapshot: v.pipe(v.string(), v.nonEmpty()),
  clientSheetId: v.pipe(v.string(), v.nonEmpty()),
  generalNotes: v.optional(v.nullable(v.string())),
  isHomeService: v.optional(v.boolean()),
  scheduledAt: v.pipe(v.string(), v.isoTimestamp()),
  serviceAddress: v.optional(v.nullable(v.string())),
  serviceType: OrderServiceTypeSchema,
  technicianId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
});
export type CreateOrder = v.InferOutput<typeof CreateOrderSchema>;

export const UpdateOrderSchema = v.object({
  clientNameSnapshot: v.optional(v.pipe(v.string(), v.nonEmpty())),
  clientSheetId: v.optional(v.pipe(v.string(), v.nonEmpty())),
  generalNotes: v.optional(v.nullable(v.string())),
  isHomeService: v.optional(v.boolean()),
  scheduledAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  serviceAddress: v.optional(v.nullable(v.string())),
  serviceType: v.optional(OrderServiceTypeSchema),
  technicianId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type UpdateOrder = v.InferOutput<typeof UpdateOrderSchema>;

export const CreateUnitSchema = v.object({
  label: v.pipe(v.string(), v.nonEmpty()),
  makeModel: v.pipe(v.string(), v.nonEmpty()),
  serialNumber: v.pipe(v.string(), v.nonEmpty()),
  year: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100)))),
});
export type CreateUnit = v.InferOutput<typeof CreateUnitSchema>;

export const UpdateUnitSchema = v.object({
  label: v.optional(v.pipe(v.string(), v.nonEmpty())),
  makeModel: v.optional(v.pipe(v.string(), v.nonEmpty())),
  serialNumber: v.optional(v.pipe(v.string(), v.nonEmpty())),
  year: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100)))),
});
export type UpdateUnit = v.InferOutput<typeof UpdateUnitSchema>;

export const AssignEquipmentSchema = v.object({
  brandSnapshot: v.optional(v.nullable(v.string())),
  carrierSnapshot: v.optional(v.nullable(v.string())),
  equipmentConditionSnapshot: v.optional(v.nullable(v.string())),
  externalId: v.optional(v.nullable(v.string())),
  externalKey: v.pipe(v.string(), v.nonEmpty()),
  iccidSnapshot: v.optional(v.nullable(v.string())),
  imei: v.optional(v.nullable(v.string())),
  lineSnapshot: v.optional(v.nullable(v.string())),
  modelSnapshot: v.optional(v.nullable(v.string())),
  rawSnapshot: v.optional(v.record(v.string(), v.string())),
  serviceStatusSnapshot: v.optional(v.nullable(v.string())),
  sheetName: v.optional(v.string()),
  sheetRowHint: v.optional(v.nullable(v.number())),
});
export type AssignEquipment = v.InferOutput<typeof AssignEquipmentSchema>;

export const OrderListQuerySchema = v.object({
  from: v.optional(v.string()),
  page: v.optional(v.pipe(v.string(), v.transform(Number))),
  pageSize: v.optional(v.pipe(v.string(), v.transform(Number))),
  search: v.optional(v.string()),
  sortBy: v.optional(v.picklist(['scheduledAt', 'createdAt', 'folio'])),
  sortOrder: v.optional(v.picklist(['asc', 'desc'])),
  status: v.optional(OrderStatusSchema),
  technicianId: v.optional(v.pipe(v.string(), v.uuid())),
  to: v.optional(v.string()),
});
export type OrderListQuery = v.InferOutput<typeof OrderListQuerySchema>;

export const UnitParamsSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  unitId: v.pipe(v.string(), v.uuid()),
});

export const EquipmentParamsSchema = v.object({
  equipmentId: v.pipe(v.string(), v.uuid()),
  id: v.pipe(v.string(), v.uuid()),
  unitId: v.pipe(v.string(), v.uuid()),
});

export const CancelOrderSchema = v.object({
  reason: v.optional(v.string()),
});
