import type { RescheduleFailedAppointment } from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  FailedAppointmentResolution,
  OrderStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import { createOrderFolio } from './order-folio.js';
import { assertSelectableTechnician } from './selectable-technician.js';

type OrderWithEquipment = Prisma.OrderGetPayload<{
  include: { units: { include: { equipment: true } } };
}>;
type OrderEquipment = OrderWithEquipment['units'][number]['equipment'][number];

function buildRescheduledEquipmentInput(
  equipment: OrderEquipment,
): Prisma.OrderEquipmentCreateWithoutOrderUnitInput {
  return {
    sheetName: equipment.sheetName,
    sheetRowHint: equipment.sheetRowHint,
    externalId: equipment.externalId,
    imei: equipment.imei,
    externalKey: equipment.externalKey,
    activeAssignment: false,
    brandSnapshot: equipment.brandSnapshot,
    modelSnapshot: equipment.modelSnapshot,
    lineSnapshot: equipment.lineSnapshot,
    iccidSnapshot: equipment.iccidSnapshot,
    carrierSnapshot: equipment.carrierSnapshot,
    equipmentConditionSnapshot: equipment.equipmentConditionSnapshot,
    serviceStatusSnapshot: equipment.serviceStatusSnapshot,
    rawSnapshot: equipment.rawSnapshot as Prisma.InputJsonValue,
    verificationStatus: 'PENDING',
  };
}

function buildRescheduledUnitInputs(
  order: OrderWithEquipment,
): Prisma.OrderUnitCreateWithoutOrderInput[] {
  return order.units.map((unit) => ({
    label: unit.label,
    makeModel: unit.makeModel,
    serialNumber: unit.serialNumber,
    year: unit.year,
    serviceType: unit.serviceType,
    status: 'PENDING',
    equipment: { create: unit.equipment.map(buildRescheduledEquipmentInput) },
  }));
}

export async function rescheduleFailedAppointment(
  prisma: PrismaClient,
  actorUserId: string,
  orderId: string,
  input: RescheduleFailedAppointment,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { units: { include: { equipment: true } } },
  });
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
  }
  if (order.status !== OrderStatus.FAILED_APPOINTMENT) {
    throw new AppError(
      400,
      'INVALID_ORDER_STATE',
      'Solo se pueden reprogramar órdenes marcadas como cita fallida',
    );
  }
  if (order.failedAppointmentResolution !== null) {
    throw new AppError(
      409,
      'FAILED_APPOINTMENT_ALREADY_RESOLVED',
      'La cita fallida ya fue resuelta',
    );
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (scheduledAt.getTime() <= Date.now()) {
    throw new AppError(
      400,
      'INVALID_SCHEDULE',
      'La nueva fecha de la cita debe estar en el futuro',
    );
  }

  const technicianId = input.technicianId ?? order.technicianId;
  if (!technicianId) {
    throw new AppError(
      400,
      'MISSING_TECHNICIAN',
      'Debe seleccionar un técnico para reprogramar la orden',
    );
  }
  const technician = await assertSelectableTechnician(prisma, technicianId);

  return domainTransaction(prisma, async (tx, effects) => {
    const resolvedAt = new Date();
    const resolution = await tx.order.updateMany({
      where: {
        id: orderId,
        version: input.version,
        status: OrderStatus.FAILED_APPOINTMENT,
        failedAppointmentResolution: null,
      },
      data: {
        failedAppointmentResolution: FailedAppointmentResolution.RESCHEDULED,
        failedAppointmentResolvedAt: resolvedAt,
        failedAppointmentResolvedById: actorUserId,
        version: { increment: 1 },
      },
    });
    if (resolution.count !== 1) {
      throw new AppError(
        409,
        'ORDER_VERSION_CONFLICT',
        'La cita fallida fue modificada o resuelta por otra solicitud',
      );
    }

    const cloned = await tx.order.create({
      data: {
        folio: createOrderFolio(),
        serviceType: order.serviceType,
        status: OrderStatus.DRAFT,
        clientSheetId: order.clientSheetId,
        clientNameSnapshot: order.clientNameSnapshot,
        technicianId,
        technicianNameSnapshot: technician.name,
        technicianExternalKeySnapshot: technician.externalKey ?? null,
        scheduledAt,
        isHomeService: order.isHomeService,
        serviceAddress: order.serviceAddress,
        generalNotes: order.generalNotes,
        createdById: actorUserId,
        rescheduledFromOrderId: order.id,
        version: 1,
        units: { create: buildRescheduledUnitInputs(order) },
      },
      include: { units: { include: { equipment: true } }, rescheduledFrom: true },
    });

    effects.audit({
      action: 'FAILED_APPOINTMENT_RESCHEDULED',
      actorUserId,
      entityType: 'Order',
      entityId: order.id,
      before: order as unknown as Prisma.InputJsonValue,
      after: {
        failedAppointmentResolution: FailedAppointmentResolution.RESCHEDULED,
        failedAppointmentResolvedAt: resolvedAt.toISOString(),
        rescheduledOrderId: cloned.id,
      },
    });
    effects.audit({
      action: 'ORDER_CREATED_FROM_FAILED_APPOINTMENT',
      actorUserId,
      entityType: 'Order',
      entityId: cloned.id,
      after: cloned as unknown as Prisma.InputJsonValue,
    });
    return cloned;
  });
}
