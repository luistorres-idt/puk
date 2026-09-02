import { randomUUID } from 'node:crypto';
import type {
  AssignEquipment,
  CreateOrder,
  CreateUnit,
  OrderListQuery,
  UpdateOrder,
  UpdateUnit,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import { updateOrderVersion } from '../../database/optimistic-lock.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, type Prisma } from '../../generated/prisma/client.js';
import type { GoogleSheetsCatalogService } from '../../integrations/google-sheets/google-sheets.service.js';
import { AppError } from '../../shared/errors.js';

export class OrdersService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheetsCatalogService?: GoogleSheetsCatalogService,
  ) {}

  public async listOrders(
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
    query: OrderListQuery,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};

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

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { folio: { contains: term, mode: 'insensitive' } },
        { clientNameSnapshot: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.from || query.to) {
      where.scheduledAt = {};
      if (query.from) where.scheduledAt.gte = new Date(query.from);
      if (query.to) where.scheduledAt.lte = new Date(query.to);
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

  public async getOrderById(
    orderId: string,
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        technician: true,
        createdBy: { select: { id: true, name: true, email: true } },
        units: {
          include: {
            equipment: true,
            checklist: { include: { items: { include: { evidence: true } } } },
            discrepancies: true,
          },
        },
        signature: true,
        discrepancies: true,
        syncOperations: { orderBy: { createdAt: 'desc' } },
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
    if (input.technicianId) {
      const technician = await this.prisma.technician.findUnique({
        where: { id: input.technicianId },
      });
      if (!technician) {
        throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'El técnico asignado no existe');
      }
    }

    const folio = `OS-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

    return domainTransaction(this.prisma, async (tx, effects) => {
      const order = await tx.order.create({
        data: {
          folio,
          serviceType: input.serviceType,
          status: OrderStatus.DRAFT,
          clientSheetId: input.clientSheetId,
          clientNameSnapshot: input.clientNameSnapshot,
          technicianId: input.technicianId ?? null,
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

      return order;
    });
  }

  public async updateOrder(actorUserId: string, orderId: string, input: UpdateOrder) {
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    if (existing.status !== OrderStatus.DRAFT && existing.status !== OrderStatus.REQUIRES_CORRECTION) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'Solo se pueden editar órdenes en borrador o en corrección');
    }

    if (input.technicianId) {
      const tech = await this.prisma.technician.findUnique({ where: { id: input.technicianId } });
      if (!tech) {
        throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'Técnico no encontrado');
      }
    }

    const updateData: Prisma.OrderUncheckedUpdateManyInput = {};
    if (input.serviceType !== undefined) updateData.serviceType = input.serviceType;
    if (input.clientSheetId !== undefined) updateData.clientSheetId = input.clientSheetId;
    if (input.clientNameSnapshot !== undefined) updateData.clientNameSnapshot = input.clientNameSnapshot;
    if (input.technicianId !== undefined) updateData.technicianId = input.technicianId;
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
    if (order.status !== OrderStatus.DRAFT) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'Solo se pueden agregar unidades a órdenes en borrador');
    }

    const duplicate = await this.prisma.orderUnit.findUnique({
      where: { orderId_serialNumber: { orderId, serialNumber: input.serialNumber } },
    });
    if (duplicate) {
      throw new AppError(409, 'DUPLICATE_SERIAL_NUMBER', 'Ya existe una unidad con ese número de serie en la orden');
    }

    return domainTransaction(this.prisma, async (tx, effects) => {
      const unit = await tx.orderUnit.create({
        data: {
          orderId,
          label: input.label,
          makeModel: input.makeModel,
          year: input.year ?? null,
          serialNumber: input.serialNumber,
        },
      });

      effects.audit({
        action: 'UNIT_ADDED',
        actorUserId,
        entityType: 'OrderUnit',
        entityId: unit.id,
        after: unit as unknown as Prisma.InputJsonValue,
      });

      return unit;
    });
  }

  public async updateUnit(actorUserId: string, orderId: string, unitId: string, input: UpdateUnit) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }
    if (order.status !== OrderStatus.DRAFT) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'Solo se pueden editar unidades en órdenes en borrador');
    }

    const existingUnit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!existingUnit || existingUnit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada en esta orden');
    }

    if (input.serialNumber && input.serialNumber !== existingUnit.serialNumber) {
      const duplicate = await this.prisma.orderUnit.findUnique({
        where: { orderId_serialNumber: { orderId, serialNumber: input.serialNumber } },
      });
      if (duplicate) {
        throw new AppError(409, 'DUPLICATE_SERIAL_NUMBER', 'Ya existe una unidad con ese número de serie');
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
    if (order.status !== OrderStatus.DRAFT) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'Solo se pueden eliminar unidades en órdenes en borrador');
    }

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
    if (order.status !== OrderStatus.DRAFT) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'Solo se pueden asignar equipos a órdenes en borrador');
    }

    const unit = await this.prisma.orderUnit.findUnique({ where: { id: unitId } });
    if (!unit || unit.orderId !== orderId) {
      throw new AppError(404, 'UNIT_NOT_FOUND', 'Unidad no encontrada');
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
          rawSnapshot: (input.rawSnapshot ?? {}) as unknown as Prisma.InputJsonValue,
          activeAssignment: false, // will activate when order transitions to ASSIGNED
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
    if (order.status !== OrderStatus.DRAFT) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'Solo se pueden desasignar equipos en órdenes en borrador');
    }

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

    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'No se puede cancelar una orden completada o cancelada');
    }

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

    if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.REQUIRES_CORRECTION) {
      throw new AppError(400, 'INVALID_ORDER_STATE', 'La orden ya ha sido asignada');
    }

    if (!order.technicianId) {
      throw new AppError(400, 'MISSING_TECHNICIAN', 'Debe asignar un técnico antes de confirmar la asignación');
    }

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
        if (fresh.currentClient && fresh.currentClient !== order.clientNameSnapshot) {
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

        // Enqueue sync operation for Sheets: Columns J, L, M, N, O
        effects.enqueue({
          idempotencyKey: `ASSIGN:${order.id}:${item.id}:${order.version}`,
          operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
          orderId: order.id,
          payload: {
            externalKey: item.externalKey,
            row: item.sheetRowHint ?? 0,
            values: {
              J: order.clientNameSnapshot,
              L: item.unit.label,
              M: item.unit.makeModel,
              N: item.unit.year ? String(item.unit.year) : '',
              O: item.unit.serialNumber,
            },
          },
        });
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
}
