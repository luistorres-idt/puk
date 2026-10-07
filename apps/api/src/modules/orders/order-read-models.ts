import {
  OrderPricingOverridesSchema,
  PricingBreakdownSchema,
  type OrderAdministrationDetail,
  type OrderAdministrationUnitDetail,
  type OrderExecutionDetail,
  type OrderExecutionUnitDetail,
} from '@puk/contracts';
import * as v from 'valibot';
import { UploadStatus, type Prisma } from '../../generated/prisma/client.js';

export const executionOrderSelect = {
  id: true,
  folio: true,
  status: true,
  serviceType: true,
  clientNameSnapshot: true,
  scheduledAt: true,
  isHomeService: true,
  serviceAddress: true,
  generalNotes: true,
  correctionReason: true,
  technician: { select: { id: true, name: true } },
  units: {
    select: {
      id: true,
      label: true,
      makeModel: true,
      serialNumber: true,
      year: true,
      serviceType: true,
      status: true,
      equipment: {
        select: {
          id: true,
          externalId: true,
          imei: true,
          brandSnapshot: true,
          modelSnapshot: true,
          equipmentConditionSnapshot: true,
          verificationStatus: true,
        },
      },
      evidence: {
        where: { status: UploadStatus.COMPLETED, deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, status: true },
      },
      checklist: {
        select: {
          id: true,
          items: {
            select: {
              id: true,
              category: true,
              condition: true,
              notes: true,
            },
          },
        },
      },
    },
  },
  signature: { select: { id: true, signerName: true, signedAt: true } },
} satisfies Prisma.OrderSelect;

export const administrationOrderSelect = {
  id: true,
  folio: true,
  status: true,
  version: true,
  serviceType: true,
  clientNameSnapshot: true,
  clientSheetId: true,
  scheduledAt: true,
  isHomeService: true,
  serviceAddress: true,
  generalNotes: true,
  failedReason: true,
  failedAppointmentResolution: true,
  failedAppointmentResolvedAt: true,
  failedAppointmentResolutionReason: true,
  rescheduledFrom: { select: { id: true, folio: true } },
  rescheduledOrder: { select: { id: true, folio: true, status: true } },
  technician: {
    select: {
      id: true,
      name: true,
      installationRate: true,
      reviewRate: true,
      uninstallationRate: true,
      replacementRate: true,
      failedAppointmentRate: true,
      fuelSensorRate: true,
    },
  },
  units: {
    select: {
      ...executionOrderSelect.units.select,
      equipment: {
        select: {
          ...executionOrderSelect.units.select.equipment.select,
          source: true,
          inventoryEquipmentId: true,
          externalKey: true,
        },
      },
    },
  },
  signature: executionOrderSelect.signature,
  pricingBaseCost: true,
  pricingTravelExpenses: true,
  pricingTotal: true,
  pricingBreakdown: true,
  pricingOverrides: true,
} satisfies Prisma.OrderSelect;

type ExecutionOrderRecord = Prisma.OrderGetPayload<{ select: typeof executionOrderSelect }>;
type AdministrationOrderRecord = Prisma.OrderGetPayload<{
  select: typeof administrationOrderSelect;
}>;

function mapChecklist(
  checklist: ExecutionOrderRecord['units'][number]['checklist'],
): OrderExecutionUnitDetail['checklist'] {
  if (!checklist) return null;
  return {
    id: checklist.id,
    items: checklist.items.map((item) => ({
      id: item.id,
      category: item.category,
      condition: item.condition,
      notes: item.notes,
    })),
  };
}

function mapSignature(
  signature: ExecutionOrderRecord['signature'],
): OrderExecutionDetail['signature'] {
  if (!signature) return null;
  return {
    id: signature.id,
    signerName: signature.signerName,
    signedAt: signature.signedAt.toISOString(),
  };
}

function mapExecutionUnit(unit: ExecutionOrderRecord['units'][number]): OrderExecutionUnitDetail {
  return {
    id: unit.id,
    label: unit.label,
    makeModel: unit.makeModel,
    serialNumber: unit.serialNumber,
    year: unit.year,
    serviceType: unit.serviceType,
    status: unit.status,
    equipment: unit.equipment.map((equipment) => ({
      id: equipment.id,
      externalId: equipment.externalId,
      imei: equipment.imei,
      brandSnapshot: equipment.brandSnapshot,
      modelSnapshot: equipment.modelSnapshot,
      equipmentConditionSnapshot: equipment.equipmentConditionSnapshot,
      verificationStatus: equipment.verificationStatus,
    })),
    evidence: unit.evidence.map((evidence) => ({ id: evidence.id, status: evidence.status })),
    checklist: mapChecklist(unit.checklist),
  };
}

function mapAdministrationUnit(
  unit: AdministrationOrderRecord['units'][number],
): OrderAdministrationUnitDetail {
  return {
    id: unit.id,
    label: unit.label,
    makeModel: unit.makeModel,
    serialNumber: unit.serialNumber,
    year: unit.year,
    serviceType: unit.serviceType,
    status: unit.status,
    equipment: unit.equipment.map((equipment) => ({
      id: equipment.id,
      externalId: equipment.externalId,
      imei: equipment.imei,
      brandSnapshot: equipment.brandSnapshot,
      modelSnapshot: equipment.modelSnapshot,
      equipmentConditionSnapshot: equipment.equipmentConditionSnapshot,
      verificationStatus: equipment.verificationStatus,
      source: equipment.source,
      inventoryEquipmentId: equipment.inventoryEquipmentId,
      externalKey: equipment.externalKey,
    })),
    evidence: unit.evidence.map((evidence) => ({ id: evidence.id, status: evidence.status })),
    checklist: mapChecklist(unit.checklist),
  };
}

export function mapExecutionOrder(order: ExecutionOrderRecord): OrderExecutionDetail {
  return {
    id: order.id,
    folio: order.folio,
    status: order.status,
    serviceType: order.serviceType,
    clientNameSnapshot: order.clientNameSnapshot,
    scheduledAt: order.scheduledAt.toISOString(),
    isHomeService: order.isHomeService,
    serviceAddress: order.serviceAddress,
    generalNotes: order.generalNotes,
    correctionReason: order.correctionReason,
    technician: order.technician ? { id: order.technician.id, name: order.technician.name } : null,
    units: order.units.map(mapExecutionUnit),
    signature: mapSignature(order.signature),
  };
}

export function mapAdministrationOrder(
  order: AdministrationOrderRecord,
): OrderAdministrationDetail {
  return {
    id: order.id,
    folio: order.folio,
    status: order.status,
    version: order.version,
    serviceType: order.serviceType,
    clientNameSnapshot: order.clientNameSnapshot,
    clientSheetId: order.clientSheetId,
    scheduledAt: order.scheduledAt.toISOString(),
    isHomeService: order.isHomeService,
    serviceAddress: order.serviceAddress,
    generalNotes: order.generalNotes,
    failedReason: order.failedReason,
    failedAppointmentResolution: order.failedAppointmentResolution,
    failedAppointmentResolvedAt: order.failedAppointmentResolvedAt?.toISOString() ?? null,
    failedAppointmentResolutionReason: order.failedAppointmentResolutionReason,
    rescheduledFrom: order.rescheduledFrom
      ? { id: order.rescheduledFrom.id, folio: order.rescheduledFrom.folio }
      : null,
    rescheduledOrder: order.rescheduledOrder
      ? {
          id: order.rescheduledOrder.id,
          folio: order.rescheduledOrder.folio,
          status: order.rescheduledOrder.status,
        }
      : null,
    technician: order.technician
      ? {
          id: order.technician.id,
          name: order.technician.name,
          installationRate: order.technician.installationRate?.toString() ?? null,
          reviewRate: order.technician.reviewRate?.toString() ?? null,
          uninstallationRate: order.technician.uninstallationRate?.toString() ?? null,
          replacementRate: order.technician.replacementRate?.toString() ?? null,
          failedAppointmentRate: order.technician.failedAppointmentRate?.toString() ?? null,
          fuelSensorRate: order.technician.fuelSensorRate?.toString() ?? null,
        }
      : null,
    units: order.units.map(mapAdministrationUnit),
    signature: mapSignature(order.signature),
    pricingBaseCost: order.pricingBaseCost?.toString() ?? null,
    pricingTravelExpenses: order.pricingTravelExpenses?.toString() ?? null,
    pricingTotal: order.pricingTotal?.toString() ?? null,
    pricingBreakdown: order.pricingBreakdown
      ? v.parse(PricingBreakdownSchema, order.pricingBreakdown)
      : null,
    pricingOverrides: order.pricingOverrides
      ? v.parse(OrderPricingOverridesSchema, order.pricingOverrides)
      : null,
  };
}
