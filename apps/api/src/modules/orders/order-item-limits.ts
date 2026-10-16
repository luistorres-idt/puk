import { MAX_ORDER_EQUIPMENT, MAX_ORDER_UNITS, type CreateOrder } from '@puk/contracts';
import { Prisma, type Prisma as PrismaTypes } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

type OrderItemTransaction = PrismaTypes.TransactionClient;

export function assertCreateOrderItemLimits(input: CreateOrder): void {
  const units = input.units ?? [];
  const equipmentCount = units.reduce((count, unit) => count + (unit.equipment?.length ?? 0), 0);
  assertOrderItemCountsWithinLimit(units.length, equipmentCount);
}

export function assertOrderItemCountsWithinLimit(unitCount: number, equipmentCount: number): void {
  if (unitCount > MAX_ORDER_UNITS) {
    throw new AppError(
      400,
      'ORDER_UNIT_LIMIT_EXCEEDED',
      `Una orden no puede tener más de ${MAX_ORDER_UNITS} unidades`,
    );
  }
  if (equipmentCount > MAX_ORDER_EQUIPMENT) {
    throw new AppError(
      400,
      'ORDER_EQUIPMENT_LIMIT_EXCEEDED',
      `Una orden no puede tener más de ${MAX_ORDER_EQUIPMENT} equipos`,
    );
  }
}

/** Serializes all order-item additions against the parent order row before counting. */
export async function lockAndCheckOrderItemCapacity(
  tx: OrderItemTransaction,
  orderId: string,
  addUnits: number,
  addEquipment: number,
): Promise<void> {
  const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`,
  );
  if (lockedOrders.length === 0) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
  }

  const [unitCount, equipmentCount] = await Promise.all([
    tx.orderUnit.count({ where: { orderId } }),
    tx.orderEquipment.count({ where: { orderUnit: { orderId } } }),
  ]);
  assertOrderItemCountsWithinLimit(unitCount + addUnits, equipmentCount + addEquipment);
}
