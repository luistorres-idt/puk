import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  completeInventoryAssignments,
  buildInventoryAssignmentReservations,
  confirmInventoryAssignment,
  confirmOrderInventoryAssignment,
  InventoryAssignmentPreparer,
  releaseOrderInventory,
  toOrderEquipmentCreateData,
} from './order-inventory.js';

describe('completeInventoryAssignments', () => {
  it('reconciles DB assignments in unit/equipment order and ignores Sheets assignments', async () => {
    const events: string[] = [];
    const tx = {
      equipment: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          events.push(`read:${where.id}`);
          return { id: where.id, version: 1 };
        }),
        updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
          events.push(`reserve:${where.id}`);
          return { count: 1 };
        }),
        update: vi.fn(async ({ where }: { where: { id: string } }) => {
          events.push(`complete:${where.id}`);
          return {};
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await completeInventoryAssignments(tx, {
      orderId: 'order-1',
      service: 'INSTALLATION',
      clientId: 'client-1',
      clientName: 'Client',
      pricingVersion: 3,
      enqueue: vi.fn((entry) => events.push(`enqueue:${entry.payload.externalKey}`)),
      units: [
        {
          serviceType: null,
          label: 'Unit 1',
          makeModel: 'Make Model',
          serialNumber: 'VIN-1',
          year: 2024,
          equipment: [
            { id: 'assignment-sheet-1', source: 'SHEETS', inventoryEquipmentId: null, externalKey: 'sheet:1', serviceStatusSnapshot: null, sheetRowHint: 5 },
            { id: 'assignment-db-1', source: 'DB', inventoryEquipmentId: 'db-1', externalKey: 'DB:db-1', serviceStatusSnapshot: null, sheetRowHint: null },
          ],
        },
        {
          serviceType: 'UNINSTALLATION',
          label: 'Unit 2',
          makeModel: 'Make Model',
          serialNumber: 'VIN-2',
          year: null,
          equipment: [
            { id: 'assignment-db-2', source: 'DB', inventoryEquipmentId: 'db-2', externalKey: 'DB:db-2', serviceStatusSnapshot: ' INSTALADO ', sheetRowHint: null },
            { id: 'assignment-sheet-2', source: 'SHEETS', inventoryEquipmentId: null, externalKey: 'sheet:2', serviceStatusSnapshot: null, sheetRowHint: 9 },
          ],
        },
      ],
    });

    expect(events).toEqual([
      'enqueue:sheet:1',
      'read:db-1', 'reserve:db-1', 'complete:db-1',
      'read:db-2', 'reserve:db-2', 'complete:db-2',
      'enqueue:sheet:2',
    ]);
  });

  it('rejects DB assignments without an inventory reference', async () => {
    const tx = {} as Prisma.TransactionClient;
    await expect(
      completeInventoryAssignments(tx, {
        orderId: 'order-1', service: 'INSTALLATION', clientId: 'client-1', clientName: 'Client', pricingVersion: 1,
        enqueue: vi.fn(),
        units: [{
          serviceType: null, label: 'Unit', makeModel: 'Make Model', serialNumber: 'VIN', year: null,
          equipment: [{ id: 'assignment-1', source: 'DB', inventoryEquipmentId: null, externalKey: 'DB:missing', serviceStatusSnapshot: null, sheetRowHint: null }],
        }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INVENTORY_REFERENCE', status: 409 });
  });
});

describe('toOrderEquipmentCreateData', () => {
  it('owns source defaulting and preserves prepared equipment snapshots', () => {
    expect(
      toOrderEquipmentCreateData({
        externalKey: 'sheet:1',
        externalId: 'catalog-id',
        imei: 'imei-1',
        sheetRowHint: 8,
        brandSnapshot: 'Brand',
        modelSnapshot: 'Model',
        serviceStatusSnapshot: 'DISPONIBLE',
        rawSnapshot: { source: 'catalog' },
      }),
    ).toEqual({
      source: 'SHEETS',
      inventoryEquipmentId: null,
      externalKey: 'sheet:1',
      externalId: 'catalog-id',
      imei: 'imei-1',
      sheetName: 'SALIDAS',
      sheetRowHint: 8,
      brandSnapshot: 'Brand',
      modelSnapshot: 'Model',
      lineSnapshot: null,
      iccidSnapshot: null,
      carrierSnapshot: null,
      equipmentConditionSnapshot: null,
      serviceStatusSnapshot: 'DISPONIBLE',
      rawSnapshot: { source: 'catalog' },
      activeAssignment: false,
    });
  });
});

describe('confirmInventoryAssignment', () => {
  it('builds reservations in Map order, using the last version and first matching IMEI', () => {
    const versions = new Map<string, number>();
    versions.set('equipment-1', 2);
    versions.set('equipment-2', 4);
    versions.set('equipment-1', 7);

    expect(
      buildInventoryAssignmentReservations(versions, [
        { inventoryEquipmentId: 'equipment-1', imei: 'first-imei' },
        { inventoryEquipmentId: 'equipment-2', imei: 'second-imei' },
        { inventoryEquipmentId: 'equipment-1', imei: 'later-imei' },
      ]),
    ).toEqual([
      { id: 'equipment-1', version: 7, imei: 'first-imei' },
      { id: 'equipment-2', version: 4, imei: 'second-imei' },
    ]);
  });

  it('reserves in input order and rejects an active IMEI alias in the caller transaction', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'alias' });
    const tx = {
      equipment: { updateMany },
      orderEquipment: { findFirst },
    } as unknown as Prisma.TransactionClient;

    await expect(
      confirmInventoryAssignment(tx, 'order-1', [
        { id: 'equipment-1', version: 2, imei: 'imei-1' },
        { id: 'equipment-2', version: 4, imei: 'imei-2' },
        { id: 'equipment-3', version: 1, imei: 'imei-3' },
      ]),
    ).rejects.toMatchObject({
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
      status: 409,
    });

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls.map(([call]) => call.where.id)).toEqual([
      'equipment-1',
      'equipment-2',
    ]);
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: {
        imei: 'imei-2',
        activeAssignment: true,
        orderUnit: { orderId: { not: 'order-1' } },
      },
    });
  });
});

describe('confirmOrderInventoryAssignment', () => {
  it('reserves first, then activates and enqueues Sheets equipment in source order', async () => {
    const events: string[] = [];
    const tx = {
      equipment: { updateMany: vi.fn(async () => { events.push('reserve'); return { count: 1 }; }) },
      orderEquipment: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(async ({ where }: { where: { id: string } }) => { events.push(`active:${where.id}`); }),
      },
    } as unknown as Prisma.TransactionClient;
    const enqueue = vi.fn((entry) => events.push(`enqueue:${entry.payload.externalKey}`));

    await confirmOrderInventoryAssignment(
      tx,
      'order-1',
      [{ id: 'db-1', version: 2, imei: 'imei-1' }],
      [
        { id: 'sheet-1', source: 'SHEETS', inventoryEquipmentId: null, externalKey: 'sheet:1', serviceStatusSnapshot: null, sheetRowHint: 7, unit: { serviceType: 'INSTALLATION', label: 'Unit', makeModel: 'Make', serialNumber: 'VIN', year: 2024 } },
        { id: 'db-assignment', source: 'DB', inventoryEquipmentId: 'db-1', externalKey: 'DB:db-1', serviceStatusSnapshot: null, sheetRowHint: null, unit: { serviceType: 'INSTALLATION', label: 'Unit', makeModel: 'Make', serialNumber: 'VIN', year: 2024 } },
      ],
      { clientName: 'Client', serviceType: 'INSTALLATION', orderVersion: 5, enqueue },
    );

    expect(events).toEqual(['reserve', 'active:sheet-1', 'enqueue:sheet:1', 'active:db-assignment']);
    expect(enqueue).toHaveBeenCalledWith({
      idempotencyKey: 'ASSIGN:order-1:sheet-1:5',
      operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
      orderId: 'order-1',
      payload: {
        externalKey: 'sheet:1', row: 7,
        values: { J: 'Client', K: 'INSTALADO', L: 'Unit', M: 'Make', N: '2024', O: 'VIN' },
      },
    });
  });
});

describe('releaseOrderInventory', () => {
  it('does not query reservations when the snapshot has no DB equipment', async () => {
    const updateMany = vi.fn();
    const tx = { equipment: { updateMany } } as unknown as Prisma.TransactionClient;

    await releaseOrderInventory(tx, 'order-1', [
      { equipment: [{ source: 'SHEETS', externalKey: 'sheet:1' }] },
    ]);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('releases reservations and increments versions when DB equipment exists', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { equipment: { updateMany } } as unknown as Prisma.TransactionClient;

    await releaseOrderInventory(tx, 'order-1', [
      { equipment: [{ source: 'DB', inventoryEquipmentId: 'equipment-1', externalKey: 'DB:equipment-1' }] },
    ]);

    expect(updateMany).toHaveBeenCalledWith({
      where: { reservedOrderId: 'order-1' },
      data: { reservedOrderId: null, version: { increment: 1 } },
    });
  });
});

describe('InventoryAssignmentPreparer', () => {
  it('checks a batch of equipment identities with one query, including DB IMEI aliases', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findMany } } as never,
      undefined,
    );

    await preparer.assertEquipmentAvailable(null, [
      { source: 'DB', inventoryEquipmentId: 'inventory-1', externalKey: 'DB:inventory-1', imei: '123456789012345' },
      { source: 'SHEETS', externalKey: 'sheet:2', imei: '987654321098765' },
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            activeAssignment: true,
            OR: [
              { OR: [{ externalKey: 'DB:inventory-1' }, { imei: '123456789012345' }] },
              { externalKey: 'sheet:2' },
            ],
          },
        ],
      },
      select: {
        externalKey: true,
        imei: true,
        activeAssignment: true,
        orderUnit: { select: { orderId: true } },
      },
    });
  });

  it('preserves duplicate-in-order precedence and active conflict errors from the batch result', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { externalKey: 'sheet:existing', imei: null, activeAssignment: false, orderUnit: { orderId: 'order-1' } },
    ]);
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findMany } } as never,
      undefined,
    );

    await expect(
      preparer.assertEquipmentAvailable('order-1', [
        { source: 'SHEETS', externalKey: 'sheet:existing' },
      ]),
    ).rejects.toMatchObject({ code: 'DUPLICATE_EQUIPMENT', status: 409 });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      input: { source: 'DB' as const, inventoryEquipmentId: 'equipment-1', externalKey: 'DB:equipment-1', imei: 'imei-1' },
      where: { OR: [{ externalKey: 'DB:equipment-1' }, { imei: 'imei-1' }], activeAssignment: true },
    },
    {
      input: { source: 'SHEETS' as const, externalKey: 'sheet:1', imei: 'imei-1' },
      where: { externalKey: 'sheet:1', activeAssignment: true },
    },
  ])('uses Inventory active-conflict query for $input.source assignments', async ({ input, where }) => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'conflicting-assignment' });
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findFirst } } as never,
      undefined,
    );

    await expect(preparer.assertNoActiveAssignmentConflict(input)).rejects.toMatchObject({
      status: 409,
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
      message: 'El equipo ya se encuentra asignado a otra orden activa',
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({ where });
  });

  it.each([
    {
      name: 'unavailable Sheets catalog',
      result: { data: [], sheetsAvailable: false },
      code: 'SHEETS_UNAVAILABLE',
      message: 'No se pueden confirmar equipos de Sheets mientras su catálogo no está disponible.',
    },
    {
      name: 'missing Sheets row',
      result: { data: [] },
      code: 'SHEET_ROW_CONFLICT',
      message: 'El equipo sheet:1 ya no es válido o no existe en Sheets',
    },
    {
      name: 'invalid Sheets identity',
      result: { data: [{ externalKey: 'sheet:1', hasValidIdentity: false }] },
      code: 'SHEET_ROW_CONFLICT',
      message: 'El equipo sheet:1 ya no es válido o no existe en Sheets',
    },
    {
      name: 'client ownership conflict',
      result: { data: [{ externalKey: 'sheet:1', hasValidIdentity: true, currentClient: 'Other client' }] },
      code: 'SHEET_ROW_CONFLICT',
      message: 'Conflicto en Sheets: el equipo sheet:1 pertenece al cliente Other client',
    },
  ])('validates $name before touching DB equipment', async ({ result, code, message }) => {
    const findUnique = vi.fn();
    const getEquipment = vi.fn().mockResolvedValue({ ...result, fetchedAt: 'now' });
    const preparer = new InventoryAssignmentPreparer(
      { equipment: { findUnique }, orderEquipment: { findFirst: vi.fn() } } as never,
      { getEquipment } as never,
    );

    await expect(
      preparer.prepareOrderAssignment(
        [
          { id: 'db-assignment', source: 'DB', inventoryEquipmentId: 'db-1', externalKey: 'DB:db-1', imei: 'imei-1', serviceType: 'INSTALLATION' },
          { id: 'sheet-assignment', source: 'SHEETS', inventoryEquipmentId: null, externalKey: 'sheet:1', imei: null, serviceType: 'INSTALLATION' },
        ],
        { id: 'client-1', name: 'Client' },
        'order-1',
        { forceFresh: false },
      ),
    ).rejects.toMatchObject({ code, message });

    expect(getEquipment).toHaveBeenCalledWith({ forceFresh: false });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate input before querying existing assignments', async () => {
    const findMany = vi.fn();
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findMany } } as never,
      undefined,
    );
    const duplicate = { source: 'SHEETS' as const, externalKey: 'sheet:1' };

    await expect(preparer.assertEquipmentAvailable('order-1', [duplicate, duplicate])).rejects.toMatchObject({
      code: 'DUPLICATE_EQUIPMENT',
      message: 'El equipo sheet:1 está duplicado en la orden',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reports an existing assignment in this order before checking active conflicts', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([
      { externalKey: 'sheet:1', imei: null, activeAssignment: false, orderUnit: { orderId: 'order-1' } },
    ]);
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findMany } } as never,
      undefined,
    );

    await expect(
      preparer.assertEquipmentAvailable('order-1', [{ source: 'SHEETS', externalKey: 'sheet:1' }]),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_EQUIPMENT',
      message: 'El equipo sheet:1 ya se encuentra asignado a esta orden',
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      OR: [
        { externalKey: { in: ['sheet:1'] }, orderUnit: { orderId: 'order-1' } },
        { activeAssignment: true, OR: [{ externalKey: 'sheet:1' }] },
      ],
    });
  });

  it('checks active DB aliases by external key or IMEI', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { externalKey: 'DB:other', imei: 'imei-1', activeAssignment: true, orderUnit: { orderId: 'other-order' } },
    ]);
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findMany } } as never,
      undefined,
    );

    await expect(
      preparer.assertEquipmentAvailable(null, [
        { source: 'DB', inventoryEquipmentId: 'equipment-1', externalKey: 'DB:equipment-1', imei: 'imei-1' },
      ]),
    ).rejects.toMatchObject({
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
      message: 'El equipo DB:equipment-1 ya se encuentra asignado a otra orden activa',
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      OR: [{ activeAssignment: true, OR: [{ OR: [{ externalKey: 'DB:equipment-1' }, { imei: 'imei-1' }] }] }],
    });
  });

  it('checks non-DB conflicts by external key only', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { externalKey: 'sheet:1', imei: 'imei-1', activeAssignment: true, orderUnit: { orderId: 'other-order' } },
    ]);
    const preparer = new InventoryAssignmentPreparer(
      { orderEquipment: { findMany } } as never,
      undefined,
    );

    await expect(
      preparer.assertEquipmentAvailable(null, [
        { source: 'SHEETS', externalKey: 'sheet:1', imei: 'imei-1' },
      ]),
    ).rejects.toMatchObject({ code: 'EQUIPMENT_ALREADY_ASSIGNED' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({
      OR: [{ activeAssignment: true, OR: [{ externalKey: 'sheet:1' }] }],
    });
  });

  it('preflights DB equipment sequentially before checking active conflicts for each source', async () => {
    const events: string[] = [];
    const tx = {
      equipment: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          events.push(`db:${where.id}`);
          return {
            id: where.id, imei: where.id, brand: 'Brand', model: 'Model', state: 'AVAILABLE',
            currentClientSheetId: null, currentClientName: null, reservedOrderId: null,
            version: where.id === 'equipment-1' ? 2 : 3,
          };
        }),
      },
      orderEquipment: {
        findFirst: vi.fn(async ({ where }: { where: { externalKey?: string; OR?: { externalKey: string }[] } }) => {
          events.push(`active:${where.externalKey ?? where.OR?.[0]?.externalKey}`);
          return null;
        }),
      },
    } as never;
    const preparer = new InventoryAssignmentPreparer(tx, undefined);

    const versions = await preparer.prepareOrderAssignment(
      [
        { id: 'assign-1', source: 'DB', inventoryEquipmentId: 'equipment-1', externalKey: 'DB:equipment-1', imei: 'equipment-1', serviceType: 'INSTALLATION' },
        { id: 'assign-2', source: 'DB', inventoryEquipmentId: 'equipment-2', externalKey: 'DB:equipment-2', imei: 'equipment-2', serviceType: 'INSTALLATION' },
        { id: 'assign-3', source: 'SHEETS', inventoryEquipmentId: null, externalKey: 'sheet:3', imei: null, serviceType: 'INSTALLATION' },
      ],
      { id: 'client-1', name: 'Client' },
      'order-1',
    );

    expect(events).toEqual([
      'db:equipment-1', 'db:equipment-1', 'db:equipment-2', 'db:equipment-2',
      'active:DB:equipment-1', 'active:DB:equipment-2', 'active:sheet:3',
    ]);
    expect([...versions]).toEqual([['equipment-1', 2], ['equipment-2', 3]]);
  });

  it('uses fresh catalog identity policy while returning snapshots from the DB record', async () => {
    const equipment = {
      id: 'equipment-1',
      imei: 'imei-1',
      brand: 'DB brand',
      model: 'DB model',
      state: 'INSTALLED',
      currentClientSheetId: 'client-1',
      currentClientName: 'Client',
      reservedOrderId: null,
    };
    const findUnique = vi.fn().mockResolvedValue(equipment);
    const getEquipment = vi.fn().mockResolvedValue({
      data: [
        {
          externalKey: 'DB:equipment-1',
          identityConflict: false,
          hasValidIdentity: true,
        },
      ],
      fetchedAt: 'now',
    });
    const preparer = new InventoryAssignmentPreparer(
      { equipment: { findUnique } } as never,
      { getEquipment } as never,
    );

    const result = await preparer.prepare(
      [{ source: 'DB', inventoryEquipmentId: 'equipment-1', externalKey: 'DB:equipment-1' }],
      'REVIEW',
      { id: 'client-1', name: 'Client' },
      'order-1',
    );

    expect(getEquipment).toHaveBeenCalledWith({ forceFresh: true });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'equipment-1' } });
    expect(result[0]).toMatchObject({
      source: 'DB',
      externalKey: 'DB:equipment-1',
      brandSnapshot: 'DB brand',
      modelSnapshot: 'DB model',
      serviceStatusSnapshot: 'INSTALADO',
    });
  });

  it('rejects a fresh catalog identity conflict before returning a DB assignment', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'equipment-1',
      imei: 'imei-1',
      brand: 'Brand',
      model: 'Model',
      state: 'AVAILABLE',
      currentClientSheetId: null,
      currentClientName: null,
      reservedOrderId: null,
    });
    const preparer = new InventoryAssignmentPreparer(
      { equipment: { findUnique } } as never,
      {
        getEquipment: vi.fn().mockResolvedValue({
          data: [
            {
              externalKey: 'DB:equipment-1',
              identityConflict: true,
              hasValidIdentity: false,
            },
          ],
          fetchedAt: 'now',
        }),
      } as never,
    );

    await expect(
      preparer.prepare(
        [{ source: 'DB', inventoryEquipmentId: 'equipment-1', externalKey: 'DB:equipment-1' }],
        'INSTALLATION',
        { id: 'client-1', name: 'Client' },
      ),
    ).rejects.toMatchObject({ code: 'EQUIPMENT_IDENTITY_CONFLICT', status: 409 });
  });
});
