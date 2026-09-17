import type { PrismaClient } from '../generated/prisma/client.js';
import { OrderStatus } from '../generated/prisma/client.js';
import { AppError } from '../shared/errors.js';

export const SHARED_TECHNICIAN_ELIGIBLE_ORDER_STATUSES = [
  OrderStatus.ASSIGNED,
  OrderStatus.IN_PROGRESS,
  OrderStatus.REQUIRES_CORRECTION,
] as const;

export type OrderAccessMode = 'INDIVIDUAL' | 'SHARED';

export interface OrderAccessActor {
  id: string;
  role: 'ADMIN' | 'TECHNICIAN';
}

export interface OrderAccessDecision {
  mode: OrderAccessMode;
  allowed: boolean;
}

type SharedAccessLookup = { orderId: string | null; userId: string | null };

export function isSharedAccessStatus(status: OrderStatus | string): boolean {
  return (SHARED_TECHNICIAN_ELIGIBLE_ORDER_STATUSES as readonly string[]).includes(status);
}

export async function getOrderAccessMode(
  prisma: PrismaClient,
  userId: string,
): Promise<OrderAccessMode> {
  const shared = await getSharedAccess(prisma);
  if (shared?.userId !== userId) return 'INDIVIDUAL';
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  return user?.active ? 'SHARED' : 'INDIVIDUAL';
}

export async function assertIndividualTechnician(
  prisma: PrismaClient,
  actor: OrderAccessActor,
  message = 'Esta acción requiere una cuenta de técnico individual.',
): Promise<void> {
  if (actor.role === 'ADMIN') return;
  if ((await getOrderAccessMode(prisma, actor.id)) === 'SHARED') {
    throw new AppError(403, 'FORBIDDEN', message);
  }
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { technicianId: true },
  });
  if (!user?.technicianId) {
    throw new AppError(403, 'FORBIDDEN', message);
  }
}

export async function assertOrderAccess(
  prisma: PrismaClient,
  actor: OrderAccessActor,
  orderId: string,
  forbiddenMessage = 'No tienes acceso a esta orden',
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, technicianId: true },
  });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');

  if (actor.role === 'ADMIN') return { order, mode: 'INDIVIDUAL' as const };

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { active: true, technicianId: true },
  });
  if (!user?.active) throw new AppError(403, 'FORBIDDEN', forbiddenMessage);

  const shared = await getSharedAccess(prisma);

  if (shared?.userId === actor.id) {
    if (order.technicianId !== null && isSharedAccessStatus(order.status)) {
      return { order, mode: 'SHARED' as const };
    }
    throw new AppError(403, 'FORBIDDEN', forbiddenMessage);
  }

  if (user.technicianId !== null && order.technicianId === user.technicianId) {
    return { order, mode: 'INDIVIDUAL' as const };
  }

  throw new AppError(403, 'FORBIDDEN', forbiddenMessage);
}

export async function getSharedAccess(prisma: PrismaClient): Promise<SharedAccessLookup | null> {
  if (prisma.sharedTechnicianAccess === undefined) return null;
  return prisma.sharedTechnicianAccess.findUnique({
    where: { id: 1 },
    select: { orderId: true, userId: true },
  });
}
