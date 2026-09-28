import * as v from 'valibot';
import { ChecklistCategorySchema, ChecklistConditionSchema } from './execution.js';
import {
  EquipmentVerificationStatusSchema,
  FailedAppointmentResolutionSchema,
  OrderServiceTypeSchema,
  OrderStatusSchema,
  OrderPricingOverridesSchema,
  PricingBreakdownSchema,
  UnitStatusSchema,
} from './orders.js';

const UuidSchema = v.pipe(v.string(), v.uuid());
const IsoTimestampSchema = v.pipe(v.string(), v.isoTimestamp());

export const OrderTechnicianSummarySchema = v.object({
  id: UuidSchema,
  name: v.string(),
});
export type OrderTechnicianSummary = v.InferOutput<typeof OrderTechnicianSummarySchema>;

export const OrderEvidenceDetailSchema = v.object({
  id: UuidSchema,
  status: v.picklist(['PENDING', 'COMPLETED', 'REJECTED', 'DELETED']),
});
export type OrderEvidenceDetail = v.InferOutput<typeof OrderEvidenceDetailSchema>;

export const OrderChecklistItemDetailSchema = v.object({
  id: UuidSchema,
  category: ChecklistCategorySchema,
  condition: v.nullable(ChecklistConditionSchema),
  notes: v.nullable(v.string()),
});
export type OrderChecklistItemDetail = v.InferOutput<typeof OrderChecklistItemDetailSchema>;

export const OrderChecklistDetailSchema = v.object({
  id: UuidSchema,
  items: v.array(OrderChecklistItemDetailSchema),
});
export type OrderChecklistDetail = v.InferOutput<typeof OrderChecklistDetailSchema>;

export const OrderExecutionEquipmentDetailSchema = v.object({
  id: UuidSchema,
  externalId: v.nullable(v.string()),
  imei: v.nullable(v.string()),
  brandSnapshot: v.nullable(v.string()),
  modelSnapshot: v.nullable(v.string()),
  equipmentConditionSnapshot: v.nullable(v.string()),
  verificationStatus: EquipmentVerificationStatusSchema,
});
export type OrderExecutionEquipmentDetail = v.InferOutput<
  typeof OrderExecutionEquipmentDetailSchema
>;

export const OrderExecutionUnitDetailSchema = v.object({
  id: UuidSchema,
  label: v.string(),
  makeModel: v.string(),
  serialNumber: v.string(),
  year: v.nullable(v.number()),
  serviceType: OrderServiceTypeSchema,
  status: UnitStatusSchema,
  equipment: v.array(OrderExecutionEquipmentDetailSchema),
  evidence: v.array(OrderEvidenceDetailSchema),
  checklist: v.nullable(OrderChecklistDetailSchema),
});
export type OrderExecutionUnitDetail = v.InferOutput<typeof OrderExecutionUnitDetailSchema>;

export const OrderSignatureDetailSchema = v.object({
  id: UuidSchema,
  signerName: v.string(),
  signedAt: IsoTimestampSchema,
});
export type OrderSignatureDetail = v.InferOutput<typeof OrderSignatureDetailSchema>;

export const OrderExecutionDetailSchema = v.object({
  id: UuidSchema,
  folio: v.string(),
  status: OrderStatusSchema,
  serviceType: OrderServiceTypeSchema,
  clientNameSnapshot: v.string(),
  scheduledAt: IsoTimestampSchema,
  isHomeService: v.boolean(),
  serviceAddress: v.nullable(v.string()),
  generalNotes: v.nullable(v.string()),
  correctionReason: v.nullable(v.string()),
  technician: v.nullable(OrderTechnicianSummarySchema),
  units: v.array(OrderExecutionUnitDetailSchema),
  signature: v.nullable(OrderSignatureDetailSchema),
});
export type OrderExecutionDetail = v.InferOutput<typeof OrderExecutionDetailSchema>;

export const OrderAdministrationTechnicianSchema = v.object({
  ...OrderTechnicianSummarySchema.entries,
  installationRate: v.nullable(v.string()),
  reviewRate: v.nullable(v.string()),
  uninstallationRate: v.nullable(v.string()),
  replacementRate: v.nullable(v.string()),
  failedAppointmentRate: v.nullable(v.string()),
  fuelSensorRate: v.nullable(v.string()),
});
export type OrderAdministrationTechnician = v.InferOutput<
  typeof OrderAdministrationTechnicianSchema
>;

export const OrderAdministrationEquipmentDetailSchema = v.object({
  ...OrderExecutionEquipmentDetailSchema.entries,
  externalKey: v.string(),
});
export type OrderAdministrationEquipmentDetail = v.InferOutput<
  typeof OrderAdministrationEquipmentDetailSchema
>;

export const OrderAdministrationUnitDetailSchema = v.object({
  ...OrderExecutionUnitDetailSchema.entries,
  equipment: v.array(OrderAdministrationEquipmentDetailSchema),
});
export type OrderAdministrationUnitDetail = v.InferOutput<
  typeof OrderAdministrationUnitDetailSchema
>;

export const OrderAdministrationDetailSchema = v.object({
  id: UuidSchema,
  folio: v.string(),
  status: OrderStatusSchema,
  version: v.number(),
  serviceType: OrderServiceTypeSchema,
  clientNameSnapshot: v.string(),
  clientSheetId: v.string(),
  scheduledAt: IsoTimestampSchema,
  isHomeService: v.boolean(),
  serviceAddress: v.nullable(v.string()),
  generalNotes: v.nullable(v.string()),
  failedReason: v.nullable(v.string()),
  failedAppointmentResolution: v.nullable(FailedAppointmentResolutionSchema),
  failedAppointmentResolvedAt: v.nullable(IsoTimestampSchema),
  failedAppointmentResolutionReason: v.nullable(v.string()),
  rescheduledFrom: v.nullable(
    v.object({
      id: UuidSchema,
      folio: v.string(),
    }),
  ),
  rescheduledOrder: v.nullable(
    v.object({
      id: UuidSchema,
      folio: v.string(),
      status: OrderStatusSchema,
    }),
  ),
  technician: v.nullable(OrderAdministrationTechnicianSchema),
  units: v.array(OrderAdministrationUnitDetailSchema),
  signature: v.nullable(OrderSignatureDetailSchema),
  pricingBaseCost: v.nullable(v.string()),
  pricingTravelExpenses: v.nullable(v.string()),
  pricingTotal: v.nullable(v.string()),
  pricingBreakdown: v.nullable(PricingBreakdownSchema),
  pricingOverrides: v.nullable(OrderPricingOverridesSchema),
});
export type OrderAdministrationDetail = v.InferOutput<typeof OrderAdministrationDetailSchema>;
