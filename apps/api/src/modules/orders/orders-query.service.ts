import {
  OrderAdministrationDetailSchema,
  OrderExecutionDetailSchema,
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

export class OrdersQueryService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listOrders(
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
    query: OrderListQuery,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

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
