import * as v from 'valibot';
import { parseOrderQueryDate } from './order-query-validation.js';
import {
  getMaxUnitYear,
  MAX_CLIENT_NAME_SNAPSHOT_LENGTH,
  MAX_ORDER_EQUIPMENT,
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  MAX_ORDER_NOTES_LENGTH,
  MAX_ORDER_QUERY_OFFSET,
  MAX_ORDER_UNITS,
  MAX_SERVICE_ADDRESS_LENGTH,
  MIN_UNIT_YEAR,
} from './validation-limits.js';

const unitYear = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(MIN_UNIT_YEAR),
  v.check((year) => Number.isSafeInteger(year), 'Use a valid integer year.'),
  v.check((year) => year <= getMaxUnitYear(), 'Year exceeds the current business-year limit.'),
);

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

export const PricingRateOverrideSchema = v.pipe(
  v.string(),
  v.maxLength(11),
  v.regex(/^\d{1,8}(\.\d{1,2})?$/, 'Debe ser un importe válido entre 0 y 99999999.99'),
);
export type PricingRateOverride = v.InferOutput<typeof PricingRateOverrideSchema>;

const PricingRateOverrideReadSchema = v.pipe(
  v.string(),
  v.regex(/^\d+(\.\d{1,2})?$/, 'Debe ser un importe válido con hasta 2 decimales'),
);

/** Historical persisted overrides retain their pre-limit read validation. */
export const OrderPricingOverridesReadSchema = v.object({
  rates: v.optional(v.record(OrderServiceTypeSchema, PricingRateOverrideReadSchema)),
  travelExpenses: v.optional(v.nullable(PricingRateOverrideReadSchema)),
  departureCost: v.optional(v.nullable(PricingRateOverrideReadSchema)),
  reason: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
});
export type OrderPricingOverridesRead = v.InferOutput<typeof OrderPricingOverridesReadSchema>;

export const OrderPricingOverridesSchema = v.object({
  rates: v.optional(v.record(OrderServiceTypeSchema, PricingRateOverrideSchema)),
  travelExpenses: v.optional(v.nullable(PricingRateOverrideSchema)),
  departureCost: v.optional(v.nullable(PricingRateOverrideSchema)),
  reason: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
});
export type OrderPricingOverrides = v.InferOutput<typeof OrderPricingOverridesSchema>;

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

export const FailedAppointmentResolutionSchema = v.picklist(['CANCELLED', 'RESCHEDULED']);
export type FailedAppointmentResolution = v.InferOutput<typeof FailedAppointmentResolutionSchema>;

export const UnitStatusSchema = v.picklist(['PENDING', 'IN_PROGRESS', 'COMPLETED']);
export type UnitStatus = v.InferOutput<typeof UnitStatusSchema>;

export const EquipmentVerificationStatusSchema = v.picklist([
  'PENDING',
  'MATCHED',
  'DISCREPANCY_REPORTED',
]);
export type EquipmentVerificationStatus = v.InferOutput<typeof EquipmentVerificationStatusSchema>;

export const SyncStatusSchema = v.picklist([
  'PENDING',
  'PROCESSING',
  'SYNCED',
  'FAILED',
  'SUPERSEDED',
]);
export type SyncStatus = v.InferOutput<typeof SyncStatusSchema>;

export const AssignEquipmentSchema = v.object({
  source: v.optional(v.picklist(['SHEETS', 'DB'])),
  inventoryEquipmentId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
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
  label: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(MAX_ORDER_UNIT_LABEL_LENGTH)),
  makeModel: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.maxLength(MAX_ORDER_UNIT_MAKE_MODEL_LENGTH),
  ),
  serialNumber: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.maxLength(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH),
  ),
  year: v.optional(v.nullable(unitYear)),
  serviceType: v.optional(OrderServiceTypeSchema),
  equipment: v.optional(v.pipe(v.array(AssignEquipmentSchema), v.maxLength(MAX_ORDER_EQUIPMENT))),
});
export type CreateOrderUnit = v.InferOutput<typeof CreateOrderUnitSchema>;

export const CreateOrderSchema = v.pipe(
  v.object({
    clientNameSnapshot: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(),
      v.check(
        (value) => value.length <= MAX_CLIENT_NAME_SNAPSHOT_LENGTH,
        `Client name cannot exceed ${MAX_CLIENT_NAME_SNAPSHOT_LENGTH} characters.`,
      ),
    ),
    clientSheetId: v.pipe(v.string(), v.nonEmpty()),
    generalNotes: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(MAX_ORDER_NOTES_LENGTH)))),
    isHomeService: v.optional(v.boolean()),
    scheduledAt: v.pipe(v.string(), v.isoTimestamp()),
    serviceAddress: v.optional(
      v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(MAX_SERVICE_ADDRESS_LENGTH))),
    ),
    serviceType: v.optional(OrderServiceTypeSchema),
    technicianId: v.pipe(
      v.string('Selecciona un técnico para crear la orden'),
      v.uuid('El técnico debe tener un identificador UUID válido'),
    ),
    units: v.optional(v.pipe(v.array(CreateOrderUnitSchema), v.maxLength(MAX_ORDER_UNITS))),
  }),
  v.check(
    (input) =>
      (input.units ?? []).reduce((total, unit) => total + (unit.equipment?.length ?? 0), 0) <=
      MAX_ORDER_EQUIPMENT,
    `An order cannot contain more than ${MAX_ORDER_EQUIPMENT} equipment items.`,
  ),
);
export type CreateOrder = v.InferOutput<typeof CreateOrderSchema>;

export const UpdateOrderSchema = v.object({
  clientNameSnapshot: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(),
      v.check(
        (value) => value.length <= MAX_CLIENT_NAME_SNAPSHOT_LENGTH,
        `Client name cannot exceed ${MAX_CLIENT_NAME_SNAPSHOT_LENGTH} characters.`,
      ),
    ),
  ),
  clientSheetId: v.optional(v.pipe(v.string(), v.nonEmpty())),
  generalNotes: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(MAX_ORDER_NOTES_LENGTH)))),
  isHomeService: v.optional(v.boolean()),
  scheduledAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  serviceAddress: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(MAX_SERVICE_ADDRESS_LENGTH))),
  ),
  serviceType: v.optional(OrderServiceTypeSchema),
  technicianId: v.optional(v.pipe(v.string(), v.uuid())),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type UpdateOrder = v.InferOutput<typeof UpdateOrderSchema>;

export const CreateUnitSchema = v.object({
  label: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(MAX_ORDER_UNIT_LABEL_LENGTH)),
  makeModel: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.maxLength(MAX_ORDER_UNIT_MAKE_MODEL_LENGTH),
  ),
  serialNumber: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(),
    v.maxLength(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH),
  ),
  year: v.optional(v.nullable(unitYear)),
  serviceType: v.optional(OrderServiceTypeSchema),
  equipment: v.optional(v.pipe(v.array(AssignEquipmentSchema), v.maxLength(MAX_ORDER_EQUIPMENT))),
});
export type CreateUnit = v.InferOutput<typeof CreateUnitSchema>;

export const UpdateUnitSchema = v.object({
  label: v.optional(
    v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(MAX_ORDER_UNIT_LABEL_LENGTH)),
  ),
  makeModel: v.optional(
    v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(MAX_ORDER_UNIT_MAKE_MODEL_LENGTH)),
  ),
  serialNumber: v.optional(
    v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH)),
  ),
  year: v.optional(v.nullable(unitYear)),
});
export type UpdateUnit = v.InferOutput<typeof UpdateUnitSchema>;

const PositiveQueryIntegerSchema = v.pipe(
  v.string(),
  v.regex(/^\d+$/, 'Use decimal digits only.'),
  v.transform(Number),
  v.check((value) => Number.isSafeInteger(value), 'Use a safe integer.'),
  v.minValue(1),
);
const OrderQueryDateSchema = v.pipe(
  v.string(),
  v.check(
    (value) => parseOrderQueryDate(value) !== undefined,
    'Use a valid date or explicitly zoned timestamp.',
  ),
);

export const OrderListQuerySchema = v.pipe(
  v.object({
    from: v.optional(OrderQueryDateSchema),
    page: v.optional(PositiveQueryIntegerSchema),
    pageSize: v.optional(v.pipe(PositiveQueryIntegerSchema, v.maxValue(100))),
    search: v.optional(v.string()),
    serviceType: v.optional(OrderServiceTypeSchema),
    sortBy: v.optional(v.picklist(['scheduledAt', 'createdAt', 'folio'])),
    sortOrder: v.optional(v.picklist(['asc', 'desc'])),
    status: v.optional(OrderStatusSchema),
    technicianId: v.optional(v.pipe(v.string(), v.uuid())),
    to: v.optional(OrderQueryDateSchema),
  }),
  v.check((query) => {
    const offset = ((query.page ?? 1) - 1) * (query.pageSize ?? 25);
    return Number.isSafeInteger(offset) && offset <= MAX_ORDER_QUERY_OFFSET;
  }, 'The pagination offset exceeds the supported range.'),
  v.check((query) => {
    if (query.from === undefined || query.to === undefined) return true;
    const from = parseOrderQueryDate(query.from);
    const to = parseOrderQueryDate(query.to);
    return from !== undefined && to !== undefined && from.getTime() <= to.getTime();
  }, 'The from date must not exceed the to date.'),
);
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

export const RescheduleFailedAppointmentSchema = v.object({
  scheduledAt: v.pipe(v.string(), v.isoTimestamp()),
  technicianId: v.optional(v.pipe(v.string(), v.uuid())),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export type RescheduleFailedAppointment = v.InferOutput<typeof RescheduleFailedAppointmentSchema>;
