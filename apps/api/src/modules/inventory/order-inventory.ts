import {
  isMatchingClient,
  type AssignEquipment,
  type ExternalEquipment,
  type OrderServiceType,
} from '@puk/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import { inventoryKey } from './equipment-catalog.js';

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

export async function releaseInventory(tx: Prisma.TransactionClient, orderId: string) {
  await tx.equipment.updateMany({
    where: { reservedOrderId: orderId },
    data: { reservedOrderId: null, version: { increment: 1 } },
  });
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
