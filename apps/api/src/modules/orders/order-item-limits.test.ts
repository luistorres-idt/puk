import { describe, expect, it, vi } from 'vitest';
import { MAX_ORDER_EQUIPMENT, MAX_ORDER_UNITS } from '@puk/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  assertCreateOrderItemLimits,
  assertOrderItemCountsWithinLimit,
  lockAndCheckOrderItemCapacity,
} from './order-item-limits.js';

describe('order item limits', () => {
  it('accepts creation at the approved unit and equipment boundaries', () => {
    expect(() =>
      assertOrderItemCountsWithinLimit(MAX_ORDER_UNITS, MAX_ORDER_EQUIPMENT),
    ).not.toThrow();
    expect(() =>
      assertCreateOrderItemLimits({
        clientNameSnapshot: 'Client',
        clientSheetId: 'CLIENT-1',
        scheduledAt: '2026-10-15T12:00:00.000Z',
        technicianId: '00000000-0000-4000-8000-000000000001',
        units: Array.from({ length: 100 }, (_, unitIndex) => ({
          label: `Unit ${unitIndex}`,
          makeModel: 'Model',
          serialNumber: `serial-${unitIndex}`,
          equipment: Array.from({ length: 5 }, (_, equipmentIndex) => ({
            externalKey: `equipment-${unitIndex}-${equipmentIndex}`,
          })),
        })),
      }),
    ).not.toThrow();
  });

  it.each([
    [MAX_ORDER_UNITS + 1, 0, 'ORDER_UNIT_LIMIT_EXCEEDED'],
    [0, MAX_ORDER_EQUIPMENT + 1, 'ORDER_EQUIPMENT_LIMIT_EXCEEDED'],
  ] as const)('rejects counts over the limit with the matching error', (units, equipment, code) => {
    expect(() => assertOrderItemCountsWithinLimit(units, equipment)).toThrow(
      expect.objectContaining({ status: 400, code }),
    );
  });

  it('locks the parent order before reading aggregate counts and rejects without writing', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'order-1' }]);
    const unitCount = vi.fn().mockResolvedValue(MAX_ORDER_UNITS - 1);
    const equipmentCount = vi.fn().mockResolvedValue(MAX_ORDER_EQUIPMENT - 1);
    const tx = {
      $queryRaw: queryRaw,
      orderUnit: { count: unitCount },
      orderEquipment: { count: equipmentCount },
    } as unknown as Prisma.TransactionClient;

    await expect(
      lockAndCheckOrderItemCapacity(tx, '00000000-0000-4000-8000-000000000001', 1, 1),
    ).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(unitCount).toHaveBeenCalledWith({
      where: { orderId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(equipmentCount).toHaveBeenCalledWith({
      where: { orderUnit: { orderId: '00000000-0000-4000-8000-000000000001' } },
    });

    equipmentCount.mockResolvedValueOnce(MAX_ORDER_EQUIPMENT);
    await expect(
      lockAndCheckOrderItemCapacity(tx, '00000000-0000-4000-8000-000000000001', 0, 1),
    ).rejects.toMatchObject({
      status: 400,
      code: 'ORDER_EQUIPMENT_LIMIT_EXCEEDED',
    });

    queryRaw.mockResolvedValueOnce([]);
    await expect(
      lockAndCheckOrderItemCapacity(tx, '00000000-0000-4000-8000-000000000001', 1, 0),
    ).rejects.toMatchObject({
      status: 404,
      code: 'ORDER_NOT_FOUND',
    });
  });
});
