import * as v from 'valibot';

export const OrderServiceTypeSchema = v.picklist([
  'INSTALLATION',
  'REVIEW',
  'UNINSTALLATION',
  'FAILED_APPOINTMENT',
  'FUEL_SENSOR',
  'EQUIPMENT_REPLACEMENT',
]);
export type OrderServiceType = v.InferOutput<typeof OrderServiceTypeSchema>;

export const ORDER_SERVICE_LABELS = {
  INSTALLATION: 'Instalación',
  REVIEW: 'Revisión',
  UNINSTALLATION: 'Desinstalación',
  FAILED_APPOINTMENT: 'Cita Fallida',
  FUEL_SENSOR: 'Sensor fuel',
  EQUIPMENT_REPLACEMENT: 'Cambio de equipo',
} as const satisfies Record<OrderServiceType, string>;

export function formatOrderServiceType(type?: string | null): string {
  return type && Object.hasOwn(ORDER_SERVICE_LABELS, type)
    ? ORDER_SERVICE_LABELS[type as OrderServiceType]
    : (type ?? '');
}

export function isServiceConfigurationSupported(type: OrderServiceType): boolean {
  switch (type) {
    case 'INSTALLATION':
    case 'REVIEW':
    case 'UNINSTALLATION':
    case 'FAILED_APPOINTMENT':
    case 'FUEL_SENSOR':
    case 'EQUIPMENT_REPLACEMENT':
      return true;
  }
}

export function canAddOrderItems(order: { status: string; serviceType?: string | null }): boolean {
  return order.status === 'DRAFT';
}

export const PricingBreakdownItemSchema = v.object({
  serviceType: OrderServiceTypeSchema,
  rate: v.string(),
  quantity: v.number(),
  subtotal: v.string(),
});
export type PricingBreakdownItem = v.InferOutput<typeof PricingBreakdownItemSchema>;

export const PricingBreakdownSchema = v.object({
  breakdown: v.array(PricingBreakdownItemSchema),
  departureCost: v.string(),
  travelExpenses: v.string(),
  warnings: v.array(v.string()),
});
export type PricingBreakdown = v.InferOutput<typeof PricingBreakdownSchema>;

export const OrderPricingSnapshotSchema = v.object({
  appliedQuantity: v.number(),
  baseCost: v.string(),
  currency: v.literal('MXN'),
  departureCost: v.string(),
  pricingVersion: v.number(),
  serviceType: OrderServiceTypeSchema,
  snapshotAt: v.string(),
  technicianExternalKeySnapshot: v.optional(v.nullable(v.string())),
  technicianId: v.pipe(v.string(), v.uuid()),
  technicianNameSnapshot: v.string(),
  totalAmount: v.string(),
  travelExpenses: v.string(),
  unitRate: v.optional(v.nullable(v.string())),
  breakdown: v.optional(v.array(PricingBreakdownItemSchema)),
});
export type OrderPricingSnapshot = v.InferOutput<typeof OrderPricingSnapshotSchema>;

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
export type EquipmentVerificationStatus = v.InferOutput<typeof EquipmentVerificationStatusSchema>;

export const SyncStatusSchema = v.picklist(['PENDING', 'PROCESSING', 'SYNCED', 'FAILED']);
export type SyncStatus = v.InferOutput<typeof SyncStatusSchema>;

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

export const CreateOrderUnitSchema = v.object({
  label: v.pipe(v.string(), v.nonEmpty()),
  makeModel: v.pipe(v.string(), v.nonEmpty()),
  serialNumber: v.pipe(v.string(), v.nonEmpty()),
  year: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100)))),
  serviceType: v.optional(OrderServiceTypeSchema),
  equipment: v.optional(v.array(AssignEquipmentSchema)),
});
export type CreateOrderUnit = v.InferOutput<typeof CreateOrderUnitSchema>;

export const CreateOrderSchema = v.object({
  clientNameSnapshot: v.pipe(v.string(), v.nonEmpty()),
  clientSheetId: v.pipe(v.string(), v.nonEmpty()),
  generalNotes: v.optional(v.nullable(v.string())),
  isHomeService: v.optional(v.boolean()),
  scheduledAt: v.pipe(v.string(), v.isoTimestamp()),
  serviceAddress: v.optional(v.nullable(v.string())),
  serviceType: v.optional(OrderServiceTypeSchema),
  technicianId: v.pipe(
    v.string('Selecciona un técnico para crear la orden'),
    v.uuid('El técnico debe tener un identificador UUID válido'),
  ),
  units: v.optional(v.array(CreateOrderUnitSchema)),
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
  technicianId: v.optional(v.pipe(v.string(), v.uuid())),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type UpdateOrder = v.InferOutput<typeof UpdateOrderSchema>;

export const CreateUnitSchema = v.object({
  label: v.pipe(v.string(), v.nonEmpty()),
  makeModel: v.pipe(v.string(), v.nonEmpty()),
  serialNumber: v.pipe(v.string(), v.nonEmpty()),
  year: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100)))),
  serviceType: v.optional(OrderServiceTypeSchema),
  equipment: v.optional(v.array(AssignEquipmentSchema)),
});
export type CreateUnit = v.InferOutput<typeof CreateUnitSchema>;

export const UpdateUnitSchema = v.object({
  label: v.optional(v.pipe(v.string(), v.nonEmpty())),
  makeModel: v.optional(v.pipe(v.string(), v.nonEmpty())),
  serialNumber: v.optional(v.pipe(v.string(), v.nonEmpty())),
  year: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1900), v.maxValue(2100)))),
});
export type UpdateUnit = v.InferOutput<typeof UpdateUnitSchema>;

export const OrderListQuerySchema = v.object({
  from: v.optional(v.string()),
  page: v.optional(v.pipe(v.string(), v.transform(Number))),
  pageSize: v.optional(v.pipe(v.string(), v.transform(Number))),
  search: v.optional(v.string()),
  serviceType: v.optional(OrderServiceTypeSchema),
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
