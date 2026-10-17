import {
  OrderAdministrationDetailSchema,
  OrderExecutionDetailSchema,
  MAX_ORDER_QUERY_OFFSET,
  parseOrderQueryDate,
  type OrderAdministrationDetail,
  type OrderExecutionDetail,
  type OrderListQuery,
} from '@puk/contracts';
import * as v from 'valibot';
import {
  assertOrderAccess,
  getSharedAccess,
  isSharedAccessStatus,
} from '../../auth/order-access-policy.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { OrderStatus, type Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import {
  administrationOrderSelect,
  executionOrderSelect,
  mapAdministrationOrder,
  mapExecutionOrder,
} from './order-read-models.js';

const SHARED_LIST_STATUSES = [
  OrderStatus.ASSIGNED,
  OrderStatus.IN_PROGRESS,
  OrderStatus.REQUIRES_CORRECTION,
] as const;

const orderListSelect = {
  id: true,
  folio: true,
  status: true,
  serviceType: true,
  clientNameSnapshot: true,
  scheduledAt: true,
  failedAppointmentResolution: true,
  technician: { select: { id: true, name: true } },
  rescheduledOrder: { select: { id: true, folio: true, status: true } },
  _count: { select: { units: true } },
} satisfies Prisma.OrderSelect;

export class OrdersQueryService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listOrders(
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
    query: OrderListQuery,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      !Number.isSafeInteger(skip) ||
      skip < 0 ||
      skip > MAX_ORDER_QUERY_OFFSET
    ) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pagination parameters.');
    }
    const from = query.from === undefined ? undefined : parseOrderQueryDate(query.from);
    const to = query.to === undefined ? undefined : parseOrderQueryDate(query.to);
    if (
      (query.from !== undefined && from === undefined) ||
      (query.to !== undefined && to === undefined) ||
      (from !== undefined && to !== undefined && from.getTime() > to.getTime())
    ) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid scheduled date range.');
    }

    const where: Prisma.OrderWhereInput = {};
    const filters: Prisma.OrderWhereInput[] = [];
    const emptyPage = {
      data: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
    };

    if (actor.role === 'TECHNICIAN') {
      const shared = await getSharedAccess(this.prisma);
      if (shared?.userId === actor.id) {
        if (query.status !== undefined && !isSharedAccessStatus(query.status)) {
          return emptyPage;
        }
        where.technicianId = query.technicianId ? query.technicianId : { not: null };
        where.status = { in: [...SHARED_LIST_STATUSES] };
      } else {
        const user = await this.prisma.user.findUnique({
          where: { id: actor.id },
          select: { technicianId: true },
        });
        if (!user?.technicianId) {
          return emptyPage;
        }
        where.technicianId = user.technicianId;
      }
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

    if (from !== undefined || to !== undefined) {
      where.scheduledAt = {};
      if (from !== undefined) where.scheduledAt.gte = from;
      if (to !== undefined) where.scheduledAt.lte = to;
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
        select: orderListSelect,
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
  ): Promise<OrderAdministrationDetail> {
    if (actor.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'No tienes acceso al detalle administrativo');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: administrationOrderSelect,
    });

    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    return v.parse(OrderAdministrationDetailSchema, mapAdministrationOrder(order));
  }

  public async getOrderExecutionById(
    orderId: string,
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
  ): Promise<OrderExecutionDetail> {
    await assertOrderAccess(this.prisma, actor, orderId, 'No tienes acceso a esta orden');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: executionOrderSelect,
    });
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    return v.parse(OrderExecutionDetailSchema, mapExecutionOrder(order));
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
