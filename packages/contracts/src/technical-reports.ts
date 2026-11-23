import * as v from 'valibot';
import { OrderServiceTypeSchema, OrderStatusSchema } from './orders.js';

const uuid = v.pipe(v.string(), v.uuid());

const weekOffsetSchema = v.optional(
  v.pipe(
    v.union([
      v.number(),
      v.pipe(
        v.string(),
        v.trim(),
        v.regex(/^-?\d+$/, 'El desplazamiento de semana debe ser un número entero.'),
        v.transform((value) => Number(value)),
      ),
    ]),
    v.integer(),
    v.minValue(-104),
    v.maxValue(12),
  ),
);

const nonNegativeMoney = v.pipe(
  v.number(),
  v.finite(),
  v.minValue(0, 'El costo de envío DHL no puede ser negativo.'),
  v.maxValue(1_000_000),
  v.check(
    (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
    'El monto solo puede tener hasta 2 decimales.',
  ),
);

export const TechnicalReportQuerySchema = v.object({
  weekOffset: weekOffsetSchema,
  technicianId: v.optional(uuid),
  serviceType: v.optional(OrderServiceTypeSchema),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
});

export const TechnicalReportExportQuerySchema = v.object({
  weekOffset: weekOffsetSchema,
  technicianId: v.optional(uuid),
});

export const UpdateOrderDhlShippingSchema = v.strictObject({
  dhlShippingCost: v.nullable(nonNegativeMoney),
});

export const TechnicalReportUnitSchema = v.object({
  id: uuid,
  label: v.string(),
  serialNumber: v.string(),
  serviceType: OrderServiceTypeSchema,
  equipmentIdentifiers: v.array(v.string()),
});

export const TechnicalReportOrderSchema = v.object({
  id: uuid,
  folio: v.string(),
  isoWeek: v.number(),
  scheduledAt: v.string(),
  completedAt: v.nullable(v.string()),
  status: OrderStatusSchema,
  serviceType: OrderServiceTypeSchema,
  serviceLabel: v.string(),
  clientName: v.string(),
  technicianId: v.nullable(uuid),
  technicianName: v.string(),
  technicianLegalName: v.nullable(v.string()),
  technicianTaxData: v.nullable(v.string()),
  baseCost: v.number(),
  travelExpenses: v.number(),
  dhlShippingCost: v.number(),
  total: v.number(),
  currency: v.string(),
  notes: v.nullable(v.string()),
  unitsCount: v.number(),
  equipmentCount: v.number(),
  units: v.array(TechnicalReportUnitSchema),
});

export const TechnicalReportTechnicianGroupSchema = v.object({
  technicianId: v.nullable(uuid),
  technicianName: v.string(),
  legalName: v.nullable(v.string()),
  taxData: v.nullable(v.string()),
  externalKey: v.nullable(v.string()),
  orderCount: v.number(),
  equipmentCount: v.number(),
  baseCost: v.number(),
  travelExpenses: v.number(),
  dhlShippingCost: v.number(),
  total: v.number(),
  orders: v.array(TechnicalReportOrderSchema),
});

export const TechnicalReportSummarySchema = v.object({
  totalOrders: v.number(),
  totalTechnicians: v.number(),
  totalEquipment: v.number(),
  baseCost: v.number(),
  travelExpenses: v.number(),
  dhlShippingCost: v.number(),
  grandTotal: v.number(),
  currency: v.string(),
});

export const TechnicalReportWindowSchema = v.object({
  weekOffset: v.number(),
  isoWeek: v.number(),
  start: v.string(),
  end: v.string(),
  cutoffWeekday: v.number(),
  timeZone: v.string(),
});

export const TechnicalReportResponseSchema = v.object({
  window: TechnicalReportWindowSchema,
  summary: TechnicalReportSummarySchema,
  groups: v.array(TechnicalReportTechnicianGroupSchema),
});

export type TechnicalReportQuery = v.InferOutput<typeof TechnicalReportQuerySchema>;
export type TechnicalReportExportQuery = v.InferOutput<typeof TechnicalReportExportQuerySchema>;
export type UpdateOrderDhlShipping = v.InferInput<typeof UpdateOrderDhlShippingSchema>;
export type TechnicalReportUnit = v.InferOutput<typeof TechnicalReportUnitSchema>;
export type TechnicalReportOrder = v.InferOutput<typeof TechnicalReportOrderSchema>;
export type TechnicalReportTechnicianGroup = v.InferOutput<
  typeof TechnicalReportTechnicianGroupSchema
>;
export type TechnicalReportSummary = v.InferOutput<typeof TechnicalReportSummarySchema>;
export type TechnicalReportWindow = v.InferOutput<typeof TechnicalReportWindowSchema>;
export type TechnicalReportResponse = v.InferOutput<typeof TechnicalReportResponseSchema>;
