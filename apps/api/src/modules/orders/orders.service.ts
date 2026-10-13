import {
  buildInventoryAssignmentReservations,
  confirmOrderInventoryAssignment,
  InventoryAssignmentPreparer,
  releaseOrderInventory,
  toOrderEquipmentCreateData,
} from '../inventory/index.js';
import {
  type AssignEquipment,
  type CreateOrder,
  type CreateUnit,
  type OrderAdministrationDetail,
  type OrderExecutionDetail,
  type OrderListQuery,
  type RescheduleFailedAppointment,
  type UpdateOrder,
  type UpdateUnit,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import { updateOrderVersion } from '../../database/optimistic-lock.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  FailedAppointmentResolution,
  OrderStatus,
  type OrderServiceType,
  type Prisma,
} from '../../generated/prisma/client.js';
import type { EquipmentCatalogPort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import {
  assertCanAddOrderItems,
  assertCanEditOrder,
  assertCanModifyUnits,
  assertServiceConfigurationSupported,
  assertValidOrderTransition,
} from './order-state-machine.js';
import { createOrderFolio } from './order-folio.js';
import { rescheduleFailedAppointment } from './reschedule-failed-appointment.js';
import { assertSelectableTechnician } from './selectable-technician.js';
import { OrdersQueryService } from './orders-query.service.js';

type OrderWithEquipment = Prisma.OrderGetPayload<{
  include: { units: { include: { equipment: true } } };
}>;

export class OrdersService {
  public constructor(
    private readonly prisma: PrismaClient,
    sheetsCatalogService?: EquipmentCatalogPort,
  ) {
    this.queries = new OrdersQueryService(prisma);
    this.inventoryAssignmentPreparer = new InventoryAssignmentPreparer(
      prisma,
      sheetsCatalogService,
    );
  }

  private readonly queries: OrdersQueryService;
  private readonly inventoryAssignmentPreparer: InventoryAssignmentPreparer;

  public async listOrders(
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
    query: OrderListQuery,
  ) {
    return this.queries.listOrders(actor, query);
  }

  public async getOrderById(
    orderId: string,
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
  ): Promise<OrderAdministrationDetail> {
    return this.queries.getOrderById(orderId, actor);
  }

  public async getOrderExecutionById(
    orderId: string,
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
  ): Promise<OrderExecutionDetail> {
    return this.queries.getOrderExecutionById(orderId, actor);
  }

  public async createOrder(actorUserId: string, input: CreateOrder) {
    const primaryServiceType = input.serviceType ?? input.units?.[0]?.serviceType ?? 'INSTALLATION';
    assertServiceConfigurationSupported(primaryServiceType);
    const tech = await assertSelectableTechnician(this.prisma, input.technicianId);
    if (input.units)
      input = {
        ...input,
        units: await Promise.all(
          input.units.map(async (unit) => ({
            ...unit,
            equipment: await this.inventoryAssignmentPreparer.prepare(
              unit.equipment ?? [],
              unit.serviceType ?? primaryServiceType,
              { id: input.clientSheetId, name: input.clientNameSnapshot },
            ),
          })),
        ),
      };

    if (input.units && input.units.length > 0) {
      const serials = new Set<string>();
      const equipmentInputs: AssignEquipment[] = [];

      for (const unit of input.units) {
        if (serials.has(unit.serialNumber)) {
          throw new AppError(
            409,
            'DUPLICATE_SERIAL_NUMBER',
            'No se pueden registrar dos unidades con el mismo número de serie en la misma orden',
          );
        }
        serials.add(unit.serialNumber);

        equipmentInputs.push(...(unit.equipment ?? []));
      }

      await this.inventoryAssignmentPreparer.assertEquipmentAvailable(null, equipmentInputs);
    }

    const folio = createOrderFolio();

    return domainTransaction(this.prisma, async (tx, effects) => {
      const order = await tx.order.create({
        data: {
          folio,
          serviceType: primaryServiceType,
          status: OrderStatus.DRAFT,
          clientSheetId: input.clientSheetId,
          clientNameSnapshot: input.clientNameSnapshot,
          technicianId: input.technicianId,
          technicianNameSnapshot: tech.name,
          technicianExternalKeySnapshot: tech.externalKey ?? null,
          scheduledAt: new Date(input.scheduledAt),
          isHomeService: input.isHomeService ?? false,
          serviceAddress: input.serviceAddress ?? null,
          generalNotes: input.generalNotes ?? null,
          createdById: actorUserId,
          version: 1,
        },
      });

      effects.audit({
        action: 'ORDER_CREATED',
        actorUserId,
        entityType: 'Order',
        entityId: order.id,
        after: order as unknown as Prisma.InputJsonValue,
      });

      if (input.units && input.units.length > 0) {
        for (const unitInput of input.units) {
          const unitServiceType = unitInput.serviceType ?? primaryServiceType;
          assertServiceConfigurationSupported(unitServiceType);
          const unit = await tx.orderUnit.create({
            data: {
              orderId: order.id,
              label: unitInput.label,
              makeModel: unitInput.makeModel,
              serialNumber: unitInput.serialNumber,
              year: unitInput.year ?? null,
              serviceType: unitServiceType,
              status: 'PENDING',
              equipment: {
                create: (unitInput.equipment ?? []).map(toOrderEquipmentCreateData),
              },
            },
            include: { equipment: true },
          });

          effects.audit({
            action: 'UNIT_CREATED',
            actorUserId,
            entityType: 'OrderUnit',
            entityId: unit.id,
            after: unit as unknown as Prisma.InputJsonValue,
          });

          for (const equipment of unit.equipment ?? []) {
            effects.audit({
              action: 'EQUIPMENT_ASSIGNED',
              actorUserId,
              entityType: 'OrderEquipment',
              entityId: equipment.id,
              after: equipment as unknown as Prisma.InputJsonValue,
            });
          }
        }
      }

      return order;
    });
  }

  public async updateOrder(actorUserId: string, orderId: string, input: UpdateOrder) {
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    assertCanEditOrder(existing.status);

    if (input.serviceType !== undefined) {
      assertServiceConfigurationSupported(input.serviceType);
    }
    let techSnapshot: { name: string; externalKey: string | null } | undefined;
    if (input.technicianId !== undefined) {
      const tech = await assertSelectableTechnician(this.prisma, input.technicianId);
      techSnapshot = { name: tech.name, externalKey: tech.externalKey ?? null };
    }

    const updateData: Prisma.OrderUncheckedUpdateManyInput = {};
    if (input.serviceType !== undefined) updateData.serviceType = input.serviceType;
    if (input.clientSheetId !== undefined) updateData.clientSheetId = input.clientSheetId;
    if (input.clientNameSnapshot !== undefined)
      updateData.clientNameSnapshot = input.clientNameSnapshot;
    if (input.technicianId !== undefined) {
      updateData.technicianId = input.technicianId;
      if (techSnapshot) {
        updateData.technicianNameSnapshot = techSnapshot.name;
        updateData.technicianExternalKeySnapshot = techSnapshot.externalKey;
      }
    }
    if (input.scheduledAt !== undefined) updateData.scheduledAt = new Date(input.scheduledAt);
    if (input.isHomeService !== undefined) updateData.isHomeService = input.isHomeService;
    if (input.serviceAddress !== undefined) updateData.serviceAddress = input.serviceAddress;
    if (input.generalNotes !== undefined) updateData.generalNotes = input.generalNotes;

    return domainTransaction(this.prisma, async (tx, effects) => {
      await updateOrderVersion(tx, orderId, input.version, updateData);

      const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      effects.audit({
        action: 'ORDER_UPDATED',
        actorUserId,
        entityType: 'Order',
        entityId: orderId,
        before: existing as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public async addUnit(actorUserId: string, orderId: string, input: CreateUnit) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    assertCanAddOrderItems(order);

    const duplicate = await this.prisma.orderUnit.findUnique({
      where: { orderId_serialNumber: { orderId, serialNumber: input.serialNumber } },
    });
    if (duplicate) {
      throw new AppError(
        409,
        'DUPLICATE_SERIAL_NUMBER',
        'Ya existe una unidad con ese número de serie en la orden',
      );
    }

    const unitServiceType = input.serviceType ?? order.serviceType;
    assertServiceConfigurationSupported(unitServiceType);
    input = {
      ...input,
      equipment: await this.inventoryAssignmentPreparer.prepare(
        input.equipment ?? [],
        unitServiceType,
        { id: order.clientSheetId, name: order.clientNameSnapshot },
        orderId,
      ),
    };
    await this.inventoryAssignmentPreparer.assertEquipmentAvailable(orderId, input.equipment ?? []);

    return domainTransaction(this.prisma, async (tx, effects) => {
      const unit = await tx.orderUnit.create({
        data: {
          orderId,
          label: input.label,
          makeModel: input.makeModel,
          year: input.year ?? null,
          serialNumber: input.serialNumber,
          serviceType: unitServiceType,
          equipment: {
            create: (input.equipment ?? []).map(toOrderEquipmentCreateData),
          },
        },
        include: { equipment: true },
      });

      effects.audit({
        action: 'UNIT_ADDED',
        actorUserId,
        entityType: 'OrderUnit',
        entityId: unit.id,
        after: unit as unknown as Prisma.InputJsonValue,
      });

      for (const equipment of unit.equipment ?? []) {
        effects.audit({
          action: 'EQUIPMENT_ASSIGNED',
          actorUserId,
          entityType: 'OrderEquipment',
          entityId: equipment.id,
          after: equipment as unknown as Prisma.InputJsonValue,
        });
      }

      return unit;
    });
  }

  public async updateUnit(actorUserId: string, orderId: string, unitId: string, input: UpdateUnit) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    assertCanModifyUnits(order.status, 'editar unidades');

    const existingUnit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!existingUnit || existingUnit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada en esta orden');
    }

    if (input.serialNumber && input.serialNumber !== existingUnit.serialNumber) {
      const duplicate = await this.prisma.orderUnit.findUnique({
        where: { orderId_serialNumber: { orderId, serialNumber: input.serialNumber } },
      });
      if (duplicate) {
        throw new AppError(
          409,
          'DUPLICATE_SERIAL_NUMBER',
          'Ya existe una unidad con ese número de serie',
        );
      }
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const unitData: Prisma.OrderUnitUpdateInput = {};
      if (input.label !== undefined) unitData.label = input.label;
      if (input.makeModel !== undefined) unitData.makeModel = input.makeModel;
      if (input.year !== undefined) unitData.year = input.year;
      if (input.serialNumber !== undefined) unitData.serialNumber = input.serialNumber;

      const updated = await tx.orderUnit.update({
        where: { id: unitId },
        data: unitData,
      });

      effects.audit({
        action: 'UNIT_UPDATED',
        actorUserId,
        entityType: 'OrderUnit',
        entityId: unitId,
        before: existingUnit as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public async deleteUnit(actorUserId: string, orderId: string, unitId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    assertCanModifyUnits(order.status, 'eliminar unidades');

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada');
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      await tx.orderUnit.delete({ where: { id: unitId } });

      effects.audit({
        action: 'UNIT_DELETED',
        actorUserId,
        entityType: 'OrderUnit',
        entityId: unitId,
        before: unit as unknown as Prisma.InputJsonValue,
      });
    });
  }

  public async assignEquipment(
    actorUserId: string,
    orderId: string,
    unitId: string,
    input: AssignEquipment,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    assertCanAddOrderItems(order);

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada');
    }

    input = (
      await this.inventoryAssignmentPreparer.prepare(
        [input],
        unit.serviceType,
        { id: order.clientSheetId, name: order.clientNameSnapshot },
        orderId,
      )
    )[0]!;

    // Check if equipment is already assigned within this order
    const existingInOrder = await this.prisma.orderEquipment.findFirst({
      where: {
        externalKey: input.externalKey,
        orderUnit: {
          orderId,
        },
      },
    });

    if (existingInOrder) {
      throw new AppError(
        409,
        'DUPLICATE_EQUIPMENT',
        `El equipo ${input.externalKey} ya se encuentra asignado a esta orden`,
      );
    }

    await this.inventoryAssignmentPreparer.assertNoActiveAssignmentConflict(input);

    return domainTransaction(this.prisma, async (tx, effects) => {
      const equipment = await tx.orderEquipment.create({
        data: {
          orderUnitId: unitId,
          ...toOrderEquipmentCreateData(input),
        },
      });

      effects.audit({
        action: 'EQUIPMENT_ASSIGNED',
        actorUserId,
        entityType: 'OrderEquipment',
        entityId: equipment.id,
        after: equipment as unknown as Prisma.InputJsonValue,
      });

      return equipment;
    });
  }

  public async removeEquipment(
    actorUserId: string,
    orderId: string,
    unitId: string,
    equipmentId: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    assertCanModifyUnits(order.status, 'desasignar equipos');

    const eq = await this.prisma.orderEquipment.findUnique({ where: { id: equipmentId } });
    if (!eq || eq.orderUnitId !== unitId) {
      throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo no encontrado');
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      await tx.orderEquipment.delete({ where: { id: equipmentId } });

      effects.audit({
        action: 'EQUIPMENT_REMOVED',
        actorUserId,
        entityType: 'OrderEquipment',
        entityId: equipmentId,
        before: eq as unknown as Prisma.InputJsonValue,
      });
    });
  }

  public async cancelOrder(actorUserId: string, orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { units: { include: { equipment: true } } },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }

    if (order.status === OrderStatus.FAILED_APPOINTMENT) {
      return this.cancelFailedAppointment(actorUserId, order, reason);
    }

    assertValidOrderTransition(
      order.status,
      OrderStatus.CANCELLED,
      'No se puede cancelar una orden completada o cancelada',
    );

    return domainTransaction(this.prisma, async (tx, effects) => {
      await releaseOrderInventory(tx, orderId, order.units);
      // Release any active equipment
      for (const unit of order.units) {
        for (const eq of unit.equipment) {
          if (eq.activeAssignment) {
            await tx.orderEquipment.update({
              where: { id: eq.id },
              data: { activeAssignment: false },
            });
          }
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          generalNotes: reason
            ? `${order.generalNotes ? `${order.generalNotes}\n` : ''}Motivo de cancelación: ${reason}`
            : order.generalNotes,
        },
      });

      effects.audit({
        action: 'ORDER_CANCELLED',
        actorUserId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  public async rescheduleFailedAppointment(
    actorUserId: string,
    orderId: string,
    input: RescheduleFailedAppointment,
  ) {
    return rescheduleFailedAppointment(this.prisma, actorUserId, orderId, input);
  }

  public async assignAndSyncOrder(
    actorUserId: string,
    orderId: string,
    options: { forceFresh?: boolean } = {},
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        units: { include: { equipment: true } },
      },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    assertValidOrderTransition(order.status, OrderStatus.ASSIGNED, 'La orden ya ha sido asignada');
    const servicesToCheck = new Set<OrderServiceType>([order.serviceType]);
    for (const unit of order.units) {
      servicesToCheck.add(unit.serviceType ?? order.serviceType);
    }
    for (const service of servicesToCheck) {
      assertServiceConfigurationSupported(service);
    }

    if (!order.technicianId) {
      throw new AppError(
        400,
        'MISSING_TECHNICIAN',
        'Debe asignar un técnico antes de confirmar la asignación',
      );
    }
    await assertSelectableTechnician(this.prisma, order.technicianId);

    if (order.units.length === 0) {
      throw new AppError(400, 'NO_UNITS', 'La orden debe tener al menos una unidad registrada');
    }

    const allEquipments = order.units.flatMap((u) => u.equipment.map((eq) => ({ ...eq, unit: u })));
    if (allEquipments.length === 0) {
      throw new AppError(400, 'NO_EQUIPMENT', 'La orden debe tener al menos un equipo asignado');
    }

    const inventoryVersions = await this.inventoryAssignmentPreparer.prepareOrderAssignment(
      allEquipments.map((item) => ({
        id: item.id,
        source: item.source,
        inventoryEquipmentId: item.inventoryEquipmentId,
        externalKey: item.externalKey,
        imei: item.imei,
        serviceType: item.unit.serviceType ?? order.serviceType,
      })),
      { id: order.clientSheetId, name: order.clientNameSnapshot },
      orderId,
      options,
    );

    return domainTransaction(this.prisma, async (tx, effects) => {
      // All inventory claims use this caller-owned transaction; catalog reads stay outside it.
      await confirmOrderInventoryAssignment(
        tx,
        orderId,
        buildInventoryAssignmentReservations(inventoryVersions, allEquipments),
        allEquipments,
        {
          clientName: order.clientNameSnapshot,
          serviceType: order.serviceType,
          orderVersion: order.version,
          enqueue: effects.enqueue,
        },
      );

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.ASSIGNED,
          version: { increment: 1 },
        },
        include: { units: { include: { equipment: true } }, syncOperations: true },
      });

      effects.audit({
        action: 'ORDER_ASSIGNED',
        actorUserId,
        entityType: 'Order',
        entityId: orderId,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });

      return updated;
    });
  }

  private async cancelFailedAppointment(
    actorUserId: string,
    order: OrderWithEquipment,
    reason?: string,
  ) {
    if (order.failedAppointmentResolution === FailedAppointmentResolution.CANCELLED) {
      return order;
    }
    if (order.failedAppointmentResolution !== null) {
      throw new AppError(
        409,
        'FAILED_APPOINTMENT_ALREADY_RESOLVED',
        'La cita fallida ya fue resuelta mediante una reprogramación',
      );
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const resolvedAt = new Date();
      const result = await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.FAILED_APPOINTMENT,
          failedAppointmentResolution: null,
        },
        data: {
          failedAppointmentResolution: FailedAppointmentResolution.CANCELLED,
          failedAppointmentResolvedAt: resolvedAt,
          failedAppointmentResolvedById: actorUserId,
          failedAppointmentResolutionReason: reason?.trim() || null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new AppError(
          409,
          'FAILED_APPOINTMENT_ALREADY_RESOLVED',
          'La cita fallida ya fue resuelta por otra solicitud',
        );
      }

      const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      effects.audit({
        action: 'FAILED_APPOINTMENT_CANCELLED',
        actorUserId,
        entityType: 'Order',
        entityId: order.id,
        before: order as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
      });
      return updated;
    });
  }

  public async getOrderAuditLogs(orderId: string) {
    return this.queries.getOrderAuditLogs(orderId);
  }
}
