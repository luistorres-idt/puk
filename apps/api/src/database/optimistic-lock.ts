import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../shared/errors.js';

export async function updateOrderVersion(
  transaction: Prisma.TransactionClient,
  orderId: string,
  expectedVersion: number,
  data: Omit<Prisma.OrderUpdateManyMutationInput, 'version'>,
): Promise<void> {
  const updated = await transaction.order.updateMany({
    data: { ...data, version: { increment: 1 } },
    where: { id: orderId, version: expectedVersion },
  });

  if (updated.count !== 1) {
    throw new AppError(409, 'ORDER_VERSION_CONFLICT', 'The order was modified by another request.');
  }
}
