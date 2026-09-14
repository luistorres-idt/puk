import { randomUUID } from 'node:crypto';
import {
  isMatchingClient,
  normalizeString,
  type AssignEquipment,
  type CreateOrder,
  type CreateUnit,
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
  UploadStatus,
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
import { buildEquipmentSheetAssignment } from './equipment-sheet-assignment.js';

type OrderWithEquipment = Prisma.OrderGetPayload<{
  include: { units: { include: { equipment: true } } };
}>;
type OrderEquipment = OrderWithEquipment['units'][number]['equipment'][number];

function createOrderFolio(): string {
  return `OS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

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

export class OrdersService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheetsCatalogService?: EquipmentCatalogPort,
  ) {}

  public async listOrders(
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
    query: OrderListQuery,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};
    const filters: Prisma.OrderWhereInput[] = [];

    if (actor.role === 'TECHNICIAN') {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { technicianId: true },
      });
      if (!user?.technicianId) {
        return { data: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };
      }
      where.technicianId = user.technicianId;
    } else if (query.technicianId) {
      where.technicianId = query.technicianId;
    }

    if (query.status) {
      where.status = query.status as OrderStatus;
    }
    if (query.serviceType) {
      filters.push({
        OR: [
          { serviceType: query.serviceType },
          { units: { some: { serviceType: query.serviceType } } },
        ],
      });
    }

    if (query.search) {
      const term = query.search.trim();
      filters.push({
        OR: [
          { folio: { contains: term, mode: 'insensitive' } },
          { clientNameSnapshot: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (query.from || query.to) {
      where.scheduledAt = {};
      if (query.from) where.scheduledAt.gte = new Date(query.from);
      if (query.to) where.scheduledAt.lte = new Date(query.to);
    }

    if (filters.length > 0) {
      where.AND = filters;
    }

    const orderBy: Prisma.OrderOrderByWithRelationInput = {};
    const sortField = query.sortBy ?? 'scheduledAt';
    const sortDirection = query.sortOrder ?? 'desc';
    orderBy[sortField] = sortDirection;

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          technician: { select: { id: true, name: true } },
          rescheduledOrder: { select: { id: true, folio: true, status: true } },
          _count: { select: { units: true } },
        },
      }),
    ]);

    return {
      data: orders,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  public async getOrderById(orderId: string, actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        technician: true,
        createdBy: { select: { id: true, name: true, email: true } },
        units: {
          include: {
            equipment: true,
            checklist: {
              include: {
                items: {
                  include: {
                    evidence: {
                      where: { status: UploadStatus.COMPLETED },
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                },
              },
            },
            discrepancies: true,
          },
        },
        signature: true,
        discrepancies: true,
        syncOperations: { orderBy: { createdAt: 'desc' } },
        rescheduledFrom: { select: { id: true, folio: true } },
        rescheduledOrder: { select: { id: true, folio: true, status: true } },
      },
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (actor.role === 'TECHNICIAN') {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { technicianId: true },
      });
      if (order.technicianId !== user?.technicianId) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes acceso a esta orden');
      }
    }

    return order;
  }

  public async createOrder(actorUserId: string, input: CreateOrder) {
    const primaryServiceType = input.serviceType ?? input.units?.[0]?.serviceType ?? 'INSTALLATION';
    assertServiceConfigurationSupported(primaryServiceType);
    const tech = await this.assertSelectableTechnician(input.technicianId);

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

      await this.assertEquipmentAvailable(null, equipmentInputs);
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
                create: (unitInput.equipment ?? []).map(buildEquipmentCreateInput),
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
      const tech = await this.assertSelectableTechnician(input.technicianId);
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
    await this.assertEquipmentAvailable(orderId, input.equipment ?? []);

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
            create: (input.equipment ?? []).map(buildEquipmentCreateInput),
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

    // Check PostgreSQL constraint: equipment cannot be actively assigned to another active order
    const conflict = await this.prisma.orderEquipment.findFirst({
      where: {
        externalKey: input.externalKey,
        activeAssignment: true,
      },
    });

    if (conflict) {
      throw new AppError(
        409,
        'EQUIPMENT_ALREADY_ASSIGNED',
        'El equipo ya se encuentra asignado a otra orden activa',
      );
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const equipment = await tx.orderEquipment.create({
        data: {
          orderUnitId: unitId,
          ...buildEquipmentCreateInput(input),
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
    const order = await this.prisma.order.findUnique({
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
    const technician = await this.assertSelectableTechnician(technicianId);

    return domainTransaction(this.prisma, async (tx, effects) => {
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
    await this.assertSelectableTechnician(order.technicianId);

    if (order.units.length === 0) {
      throw new AppError(400, 'NO_UNITS', 'La orden debe tener al menos una unidad registrada');
    }

    const allEquipments = order.units.flatMap((u) => u.equipment.map((eq) => ({ ...eq, unit: u })));
    if (allEquipments.length === 0) {
      throw new AppError(400, 'NO_EQUIPMENT', 'La orden debe tener al menos un equipo asignado');
    }

    // Fresh re-validation against Google Sheets
    if (this.sheetsCatalogService) {
      const freshEquipmentCatalog = await this.sheetsCatalogService.getEquipment({
        forceFresh: options.forceFresh ?? true,
      });

      for (const item of allEquipments) {
        const fresh = freshEquipmentCatalog.data.find((e) => e.externalKey === item.externalKey);
        if (!fresh || !fresh.hasValidIdentity) {
          throw new AppError(
            409,
            'SHEET_ROW_CONFLICT',
            `El equipo ${item.externalKey} ya no es válido o no existe en Sheets`,
          );
        }

        // If client was modified externally in Sheets to another client
        const matchesClientName = isMatchingClient(fresh.currentClient, order.clientNameSnapshot);
        const matchesClientId =
          normalizeString(fresh.currentClient) === normalizeString(order.clientSheetId);
        if (fresh.currentClient && !matchesClientName && !matchesClientId) {
          throw new AppError(
            409,
            'SHEET_ROW_CONFLICT',
            `Conflicto en Sheets: el equipo ${item.externalKey} pertenece al cliente ${fresh.currentClient}`,
          );
        }
      }
    }

    // Check Postgres that none of the equipment is active elsewhere
    for (const item of allEquipments) {
      const activeConflict = await this.prisma.orderEquipment.findFirst({
        where: {
          externalKey: item.externalKey,
          activeAssignment: true,
          id: { not: item.id },
        },
      });
      if (activeConflict) {
        throw new AppError(
          409,
          'EQUIPMENT_ALREADY_ASSIGNED',
          `El equipo ${item.externalKey} está activo en otra orden`,
        );
      }
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      // Mark all equipment as active assignment
      for (const item of allEquipments) {
        await tx.orderEquipment.update({
          where: { id: item.id },
          data: { activeAssignment: true },
        });

        const effectiveServiceType = item.unit.serviceType ?? order.serviceType;
        const syncValues = buildEquipmentSheetAssignment({
          clientName: order.clientNameSnapshot,
          equipmentServiceStatus: item.serviceStatusSnapshot,
          serviceType: effectiveServiceType,
          unit: item.unit,
        });

        // Enqueue sync operation for Sheets
        if (syncValues) {
          effects.enqueue({
            idempotencyKey: `ASSIGN:${order.id}:${item.id}:${order.version}`,
            operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
            orderId: order.id,
            payload: {
              externalKey: item.externalKey,
              row: item.sheetRowHint ?? 0,
              values: syncValues,
            },
          });
        }
      }

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

  private async assertSelectableTechnician(technicianId: string): Promise<{
    id: string;
    name: string;
    externalKey: string | null;
    active: boolean;
  }> {
    if (!technicianId) {
      throw new AppError(400, 'MISSING_TECHNICIAN', 'Selecciona un técnico para la orden');
    }
    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
      select: { id: true, name: true, externalKey: true, active: true },
    });
    if (!technician) {
      throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'El técnico seleccionado no existe');
    }
    if (!technician.active) {
      throw new AppError(
        400,
        'TECHNICIAN_INACTIVE',
        'El técnico seleccionado está inactivo. Recarga el directorio y elige otro técnico.',
      );
    }
    return technician;
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

  private async assertEquipmentAvailable(
    orderId: string | null,
    equipmentInputs: readonly AssignEquipment[],
  ): Promise<void> {
    const keys = equipmentInputs.map((equipment) => equipment.externalKey);
    const duplicateKey = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicateKey) {
      throw new AppError(
        409,
        'DUPLICATE_EQUIPMENT',
        `El equipo ${duplicateKey} está duplicado en la orden`,
      );
    }

    for (const externalKey of keys) {
      if (orderId) {
        const existingInOrder = await this.prisma.orderEquipment.findFirst({
          where: { externalKey, orderUnit: { orderId } },
        });
        if (existingInOrder) {
          throw new AppError(
            409,
            'DUPLICATE_EQUIPMENT',
            `El equipo ${externalKey} ya se encuentra asignado a esta orden`,
          );
        }
      }

      const activeConflict = await this.prisma.orderEquipment.findFirst({
        where: { externalKey, activeAssignment: true },
      });
      if (activeConflict) {
        throw new AppError(
          409,
          'EQUIPMENT_ALREADY_ASSIGNED',
          `El equipo ${externalKey} ya se encuentra asignado a otra orden activa`,
        );
      }
    }
  }

  public async getOrderAuditLogs(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    return this.prisma.auditLog.findMany({
      where: { entityId: orderId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
  }
}

function buildEquipmentCreateInput(
  input: AssignEquipment,
): Prisma.OrderEquipmentUncheckedCreateWithoutOrderUnitInput {
  return {
    externalKey: input.externalKey,
    externalId: input.externalId ?? null,
    imei: input.imei ?? null,
    sheetName: input.sheetName ?? 'SALIDAS',
    sheetRowHint: input.sheetRowHint ?? null,
    brandSnapshot: input.brandSnapshot ?? null,
    modelSnapshot: input.modelSnapshot ?? null,
    lineSnapshot: input.lineSnapshot ?? null,
    iccidSnapshot: input.iccidSnapshot ?? null,
    carrierSnapshot: input.carrierSnapshot ?? null,
    equipmentConditionSnapshot: input.equipmentConditionSnapshot ?? null,
    serviceStatusSnapshot: input.serviceStatusSnapshot ?? null,
    rawSnapshot: (input.rawSnapshot ?? {}) as Prisma.InputJsonValue,
    activeAssignment: false,
  };
}
