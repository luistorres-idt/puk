import {
  isMatchingClient,
  normalizeString,
  type AssignEquipment,
  type ExternalEquipment,
  type OrderServiceType,
} from '@puk/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { EquipmentCatalogPort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import { inventoryKey, toCatalogEquipment } from './equipment-catalog.js';
import { buildEquipmentSheetAssignment } from './equipment-sheet-assignment.js';

export function isDatabaseEquipment(equipment: {
  source?: string | undefined;
  inventoryEquipmentId?: string | null | undefined;
  externalKey: string;
}): boolean {
  return (
    equipment.source === 'DB' ||
    Boolean(equipment.inventoryEquipmentId) ||
    equipment.externalKey.startsWith('DB:')
  );
}

export function assertInventoryCompatibility(
  equipment: ExternalEquipment,
  service: OrderServiceType,
  client: { id: string; name: string },
  orderId?: string | null,
) {
  if (!equipment.hasValidIdentity || equipment.identityConflict)
    throw new AppError(
      409,
      'EQUIPMENT_IDENTITY_CONFLICT',
      'El equipo tiene datos de identidad contradictorios.',
    );
  if (equipment.reservedOrderId && equipment.reservedOrderId !== orderId)
    throw new AppError(
      409,
      'EQUIPMENT_ALREADY_ASSIGNED',
      'El equipo está reservado en otra orden activa.',
    );
  const installed = equipment.serviceStatus === 'INSTALADO';
  const matches =
    equipment.currentClientSheetId === client.id ||
    (!equipment.currentClientSheetId && isMatchingClient(equipment.currentClient, client.name));
  const installation = service === 'INSTALLATION' || service === 'FUEL_SENSOR';
  const installedService = service === 'REVIEW' || service === 'UNINSTALLATION';
  if (
    (installation && installed) ||
    (installedService && !installed) ||
    (installed && !matches) ||
    service === 'FAILED_APPOINTMENT'
  ) {
    throw new AppError(
      409,
      'INVENTORY_SERVICE_CONFLICT',
      'El estado o cliente del equipo no es compatible con el servicio seleccionado.',
    );
  }
}

export function inventoryAssignment(equipment: ExternalEquipment): AssignEquipment {
  return {
    source: 'DB',
    inventoryEquipmentId: equipment.inventoryEquipmentId!,
    externalKey: equipment.externalKey,
    externalId: equipment.id,
    imei: equipment.imei,
    brandSnapshot: equipment.brand,
    modelSnapshot: equipment.model,
    serviceStatusSnapshot: equipment.serviceStatus,
    rawSnapshot: {},
    sheetRowHint: null,
    equipmentConditionSnapshot: equipment.condition,
  };
}

/** Maps the inventory-owned equipment source and snapshots to an order persistence record. */
export function toOrderEquipmentCreateData(
  input: AssignEquipment,
): Prisma.OrderEquipmentUncheckedCreateWithoutOrderUnitInput {
  return {
    source: input.source ?? 'SHEETS',
    inventoryEquipmentId: input.inventoryEquipmentId ?? null,
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

/** Resolves and validates DB equipment selections before the caller opens its transaction. */
export class InventoryAssignmentPreparer {
  private freshCatalogRequest:
    ReturnType<EquipmentCatalogPort['getEquipment']> | undefined;

  public constructor(
    private readonly prisma: PrismaClient,
    private readonly catalog?: EquipmentCatalogPort,
  ) {}

  public async prepare(
    inputs: readonly AssignEquipment[],
    service: OrderServiceType,
    client: { id: string; name: string },
    orderId?: string | null,
  ): Promise<AssignEquipment[]> {
    if (!inputs.some(isDatabaseEquipment)) return [...inputs];
    const catalog = await this.getFreshCatalog();
    return Promise.all(
      inputs.map(async (input) => {
        if (!isDatabaseEquipment(input)) return input;
        const id = validateInventoryReference(input);
        const equipment = await this.prisma.equipment.findUnique({ where: { id } });
        if (!equipment)
          throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo registrado no encontrado.');
        const fresh =
          catalog?.data.find((item) => item.externalKey === input.externalKey) ??
          toCatalogEquipment(equipment);
        assertInventoryCompatibility(
          {
            ...toCatalogEquipment(equipment),
            identityConflict: fresh.identityConflict,
            hasValidIdentity: fresh.hasValidIdentity,
          },
          service,
          client,
          orderId,
        );
        return inventoryAssignment(toCatalogEquipment(equipment));
      }),
    );
  }

  /** Performs DB equipment preflight and cross-source active checks before the caller transaction. */
  public async prepareOrderAssignment(
    equipment: readonly {
      id: string;
      source: 'DB' | 'SHEETS';
      inventoryEquipmentId: string | null;
      externalKey: string;
      imei: string | null;
      serviceType: OrderServiceType;
    }[],
    client: { id: string; name: string },
    orderId: string,
    options: { forceFresh?: boolean } = {},
  ): Promise<Map<string, number>> {
    const versions = new Map<string, number>();
    if (this.catalog && equipment.some((item) => !isDatabaseEquipment(item))) {
      const freshEquipmentCatalog = await this.catalog.getEquipment({
        forceFresh: options.forceFresh ?? true,
      });
      if (freshEquipmentCatalog.sheetsAvailable === false)
        throw new AppError(
          503,
          'SHEETS_UNAVAILABLE',
          'No se pueden confirmar equipos de Sheets mientras su catálogo no está disponible.',
        );

      for (const item of equipment.filter((entry) => !isDatabaseEquipment(entry))) {
        const fresh = freshEquipmentCatalog.data.find((entry) => entry.externalKey === item.externalKey);
        if (!fresh || !fresh.hasValidIdentity)
          throw new AppError(
            409,
            'SHEET_ROW_CONFLICT',
            `El equipo ${item.externalKey} ya no es válido o no existe en Sheets`,
          );

        const matchesClientName = isMatchingClient(fresh.currentClient, client.name);
        const matchesClientId = normalizeString(fresh.currentClient) === normalizeString(client.id);
        if (fresh.currentClient && !matchesClientName && !matchesClientId)
          throw new AppError(
            409,
            'SHEET_ROW_CONFLICT',
            `Conflicto en Sheets: el equipo ${item.externalKey} pertenece al cliente ${fresh.currentClient}`,
          );
      }
    }

    for (const item of equipment) {
      if (isDatabaseEquipment(item)) {
        const id = validateInventoryReference(item);
        await this.prepare([item], item.serviceType, client, orderId);
        const current = await this.prisma.equipment.findUnique({ where: { id } });
        if (!current)
          throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo registrado no encontrado.');
        assertInventoryCompatibility(
          toCatalogEquipment(current),
          item.serviceType,
          client,
          orderId,
        );
        versions.set(id, current.version);
      }
    }

    for (const item of equipment) {
      const activeConflict = await this.prisma.orderEquipment.findFirst({
        where: {
          ...(isDatabaseEquipment(item) && item.imei
            ? { OR: [{ externalKey: item.externalKey }, { imei: item.imei }] }
            : { externalKey: item.externalKey }),
          activeAssignment: true,
          id: { not: item.id },
        },
      });
      if (activeConflict)
        throw new AppError(
          409,
          'EQUIPMENT_ALREADY_ASSIGNED',
          `El equipo ${item.externalKey} está activo en otra orden`,
        );
    }
    return versions;
  }

  /** Applies duplicate, existing-order and active assignment checks in their established order. */
  public async assertEquipmentAvailable(
    orderId: string | null,
    equipmentInputs: readonly AssignEquipment[],
  ): Promise<void> {
    const keys = equipmentInputs.map((equipment) => equipment.externalKey);
    const duplicateKey = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicateKey)
      throw new AppError(
        409,
        'DUPLICATE_EQUIPMENT',
        `El equipo ${duplicateKey} está duplicado en la orden`,
      );

    for (const externalKey of keys) {
      if (orderId) {
        const existingInOrder = await this.prisma.orderEquipment.findFirst({
          where: { externalKey, orderUnit: { orderId } },
        });
        if (existingInOrder)
          throw new AppError(
            409,
            'DUPLICATE_EQUIPMENT',
            `El equipo ${externalKey} ya se encuentra asignado a esta orden`,
          );
      }

      const input = equipmentInputs.find((equipment) => equipment.externalKey === externalKey)!;
      const activeConflict = await this.prisma.orderEquipment.findFirst({
        where: {
          ...(isDatabaseEquipment(input) && input.imei
            ? { OR: [{ externalKey }, { imei: input.imei }] }
            : { externalKey }),
          activeAssignment: true,
        },
      });
      if (activeConflict)
        throw new AppError(
          409,
          'EQUIPMENT_ALREADY_ASSIGNED',
          `El equipo ${externalKey} ya se encuentra asignado a otra orden activa`,
        );
    }
  }

  /** Checks another active assignment using inventory-specific alias rules. */
  public async assertNoActiveAssignmentConflict(input: AssignEquipment): Promise<void> {
    const conflict = await this.prisma.orderEquipment.findFirst({
      where: {
        ...(isDatabaseEquipment(input) && input.imei
          ? { OR: [{ externalKey: input.externalKey }, { imei: input.imei }] }
          : { externalKey: input.externalKey }),
        activeAssignment: true,
      },
    });
    if (conflict)
      throw new AppError(
        409,
        'EQUIPMENT_ALREADY_ASSIGNED',
        'El equipo ya se encuentra asignado a otra orden activa',
      );
  }

  private async getFreshCatalog() {
    if (!this.catalog) return null;
    const request = this.freshCatalogRequest ?? this.catalog.getEquipment({ forceFresh: true });
    this.freshCatalogRequest = request;
    try {
      return await request;
    } finally {
      if (this.freshCatalogRequest === request) this.freshCatalogRequest = undefined;
    }
  }
}

export async function reserveInventory(
  tx: Prisma.TransactionClient,
  equipmentId: string,
  orderId: string,
  version: number,
) {
  const claimed = await tx.equipment.updateMany({
    where: {
      id: equipmentId,
      version,
      OR: [{ reservedOrderId: null }, { reservedOrderId: orderId }],
    },
    data: { reservedOrderId: orderId, version: { increment: 1 } },
  });
  if (claimed.count !== 1)
    throw new AppError(
      409,
      'EQUIPMENT_ALREADY_ASSIGNED',
      'El equipo cambió o fue reservado por otra orden. Actualiza la selección.',
    );
}

/** Confirms the inventory claims for an assignment using the caller's transaction. */
export async function confirmInventoryAssignment(
  tx: Prisma.TransactionClient,
  orderId: string,
  reservations: readonly {
    id: string;
    version: number;
    imei: string | null;
  }[],
) {
  for (const item of reservations) {
    await reserveInventory(tx, item.id, orderId, item.version);
    const aliasConflict = await tx.orderEquipment.findFirst({
      where: {
        imei: item.imei,
        activeAssignment: true,
        orderUnit: { orderId: { not: orderId } },
      },
    });
    if (aliasConflict)
      throw new AppError(
        409,
        'EQUIPMENT_ALREADY_ASSIGNED',
        'El mismo IMEI está activo en otra orden, aunque use otra referencia de catálogo.',
      );
  }
}

/** Joins captured inventory versions to the first matching equipment's IMEI in map order. */
export function buildInventoryAssignmentReservations(
  versions: ReadonlyMap<string, number>,
  equipment: readonly { inventoryEquipmentId: string | null; imei: string | null }[],
): { id: string; version: number; imei: string | null }[] {
  return [...versions].map(([id, version]) => {
    const item = equipment.find((entry) => entry.inventoryEquipmentId === id)!;
    return { id, version, imei: item.imei };
  });
}

/** Confirms inventory reservations, active flags and Sheets outbox in equipment order. */
export async function confirmOrderInventoryAssignment(
  tx: Prisma.TransactionClient,
  orderId: string,
  reservations: readonly { id: string; version: number; imei: string | null }[],
  equipment: readonly {
    id: string;
    source: 'DB' | 'SHEETS';
    inventoryEquipmentId: string | null;
    externalKey: string;
    serviceStatusSnapshot: string | null;
    sheetRowHint: number | null;
    unit: {
      serviceType: OrderServiceType | null;
      label: string;
      makeModel: string;
      serialNumber: string;
      year: number | null;
    };
  }[],
  input: {
    clientName: string;
    serviceType: OrderServiceType;
    orderVersion: number;
    enqueue: (entry: {
      idempotencyKey: string;
      operationType: 'SHEET_EQUIPMENT_ASSIGNMENT';
      orderId: string;
      payload: { externalKey: string; row: number; values: Record<string, string> };
    }) => void;
  },
) {
  await confirmInventoryAssignment(tx, orderId, reservations);
  for (const item of equipment) {
    await tx.orderEquipment.update({
      where: { id: item.id },
      data: { activeAssignment: true },
    });
    const values = buildEquipmentSheetAssignment({
      clientName: input.clientName,
      equipmentServiceStatus: item.serviceStatusSnapshot,
      serviceType: item.unit.serviceType ?? input.serviceType,
      unit: item.unit,
    });
    if (values && !isDatabaseEquipment(item))
      input.enqueue({
        idempotencyKey: `ASSIGN:${orderId}:${item.id}:${input.orderVersion}`,
        operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
        orderId,
        payload: { externalKey: item.externalKey, row: item.sheetRowHint ?? 0, values },
      });
  }
}

export async function releaseInventory(tx: Prisma.TransactionClient, orderId: string) {
  await tx.equipment.updateMany({
    where: { reservedOrderId: orderId },
    data: { reservedOrderId: null, version: { increment: 1 } },
  });
}

/** Releases an order's DB reservations only when its snapshot contains DB equipment. */
export async function releaseOrderInventory(
  tx: Prisma.TransactionClient,
  orderId: string,
  units: readonly {
    equipment: readonly { source?: string; inventoryEquipmentId?: string | null; externalKey: string }[];
  }[],
) {
  if (!units.some((unit) => unit.equipment.some(isDatabaseEquipment))) return;
  await releaseInventory(tx, orderId);
}

export async function completeInventoryEquipment(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    equipmentId: string;
    service: OrderServiceType;
    initiallyInstalled: boolean;
    clientId: string;
    clientName: string;
    unit: { label: string; makeModel: string; serialNumber: string; year: number | null };
  },
) {
  const current = await tx.equipment.findUnique({ where: { id: input.equipmentId } });
  if (!current)
    throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'El equipo registrado ya no existe.');
  await reserveInventory(tx, current.id, input.orderId, current.version);
  const installed =
    input.service !== 'UNINSTALLATION' &&
    !(input.service === 'EQUIPMENT_REPLACEMENT' && input.initiallyInstalled);
  await tx.equipment.update({
    where: { id: current.id },
    data: {
      state: installed ? 'INSTALLED' : 'AVAILABLE',
      currentClientSheetId: installed ? input.clientId : null,
      currentClientName: installed ? input.clientName : null,
      unitLabel: installed ? input.unit.label : null,
      unitMakeModel: installed ? input.unit.makeModel : null,
      unitSerialNumber: installed ? input.unit.serialNumber : null,
      unitYear: installed ? input.unit.year : null,
      reservedOrderId: null,
      version: { increment: 1 },
    },
  });
}

/** Reconciles DB-backed assignments in their persisted unit/equipment order. */
export async function completeInventoryAssignments(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    service: OrderServiceType;
    clientId: string;
    clientName: string;
    pricingVersion: number;
    enqueue: (entry: {
      idempotencyKey: string;
      operationType: 'SHEET_EQUIPMENT_ASSIGNMENT';
      orderId: string;
      payload: { externalKey: string; row: number; values: Record<string, string> };
    }) => void;
    units: readonly {
      serviceType: OrderServiceType | null;
      label: string;
      makeModel: string;
      serialNumber: string;
      year: number | null;
      equipment: readonly {
        id: string;
        source: string;
        inventoryEquipmentId: string | null;
        externalKey: string;
        serviceStatusSnapshot: string | null;
        sheetRowHint: number | null;
      }[];
    }[];
  },
) {
  for (const unit of input.units) {
    for (const equipment of unit.equipment) {
      const service = unit.serviceType ?? input.service;
      if (isDatabaseEquipment(equipment)) {
        if (!equipment.inventoryEquipmentId)
          throw new AppError(
            409,
            'INVALID_INVENTORY_REFERENCE',
            'El equipo no tiene una referencia de inventario válida.',
          );
        await completeInventoryEquipment(tx, {
          orderId: input.orderId,
          equipmentId: equipment.inventoryEquipmentId,
          service,
          initiallyInstalled: equipment.serviceStatusSnapshot?.trim().toUpperCase() === 'INSTALADO',
          clientId: input.clientId,
          clientName: input.clientName,
          unit,
        });
        continue;
      }

      const values = buildEquipmentSheetAssignment({
        clientName: input.clientName,
        equipmentServiceStatus: equipment.serviceStatusSnapshot,
        serviceType: service,
        unit,
      });
      if (!values) continue;
      input.enqueue({
        idempotencyKey: `COMPLETE_ASSIGNMENT:${input.orderId}:${equipment.id}:${input.pricingVersion}`,
        operationType: 'SHEET_EQUIPMENT_ASSIGNMENT',
        orderId: input.orderId,
        payload: { externalKey: equipment.externalKey, row: equipment.sheetRowHint ?? 0, values },
      });
    }
  }
}

export function validateInventoryReference(input: {
  source?: string | undefined;
  inventoryEquipmentId?: string | null | undefined;
  externalKey: string;
}): string {
  const id = input.inventoryEquipmentId;
  if (input.source !== 'DB' || !id || input.externalKey !== inventoryKey(id))
    throw new AppError(
      400,
      'INVALID_INVENTORY_REFERENCE',
      'La referencia del equipo registrado no es válida.',
    );
  return id;
}
