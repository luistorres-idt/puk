import { assertOrderAccess } from '../../auth/order-access-policy.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

export async function loadAccessibleExecutionOrder(
  prisma: PrismaClient,
  userId: string,
  role: 'ADMIN' | 'TECHNICIAN',
  orderId: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { technician: true },
  });

  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
  }

  await assertOrderAccess(
    prisma,
    { id: userId, role },
    orderId,
    'No tienes asignada esta orden de servicio',
  );

  return order;
}
