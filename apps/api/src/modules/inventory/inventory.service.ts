import { createHash, randomUUID } from 'node:crypto';
import * as v from 'valibot';
import {
  initialEquipmentState,
  RegisterEquipmentSchema,
  UpdateInventoryEquipmentSchema,
  DeleteInventoryEquipmentSchema,
  type InventoryEquipment,
  type UpdateInventoryEquipment,
  type DeleteInventoryEquipment,
  type RegisterEquipment,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { EquipmentCatalogPort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import { toCatalogEquipment } from './equipment-catalog.js';

const managementSelection = {
  id: true,
  imei: true,
  brand: true,
  model: true,
  state: true,
  currentClientSheetId: true,
  currentClientName: true,
  unitLabel: true,
  unitMakeModel: true,
  unitSerialNumber: true,
  unitYear: true,
  reservedOrderId: true,
  deletedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EquipmentSelect;

type ManagedEquipmentRow = Prisma.EquipmentGetPayload<{ select: typeof managementSelection }>;
type InventoryActor = { id: string; role: 'ADMIN' | 'TECHNICIAN' };
function requireAdmin(actor: InventoryActor): void {
  if (actor.role !== 'ADMIN')
    throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede administrar equipos.');
}
function toManagementEquipment(row: ManagedEquipmentRow): InventoryEquipment {
  const { createdAt, updatedAt, deletedAt: _deletedAt, ...equipment } = row;
  return {
    ...equipment,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    canDelete:
      row.deletedAt === null &&
      row.state === 'AVAILABLE' &&
      row.reservedOrderId === null,
  };
}
function equipmentConflict(): AppError {
  return new AppError(
    409,
    'INVENTORY_EQUIPMENT_CONFLICT',
    'El equipo cambió. Actualiza la lista antes de reintentar.',
  );
}

export class InventoryService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheets: EquipmentCatalogPort,
  ) {}

  public async list(actor: InventoryActor): Promise<InventoryEquipment[]> {
    requireAdmin(actor);
    const equipment = await this.prisma.equipment.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: managementSelection,
    });
    return equipment.map(toManagementEquipment);
  }

  public async update(
    actor: InventoryActor,
    id: string,
    request: UpdateInventoryEquipment,
  ): Promise<InventoryEquipment> {
    requireAdmin(actor);
    const parsed = v.safeParse(UpdateInventoryEquipmentSchema, request);
    if (!parsed.success)
      throw new AppError(400, 'VALIDATION_ERROR', 'IMEI, marca, modelo o versión inválidos.');
    const input = parsed.output;
    const current = await this.prisma.equipment.findUnique({
      where: { id },
      select: { imei: true, version: true, deletedAt: true },
    });
    if (!current || current.deletedAt !== null)
      throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo registrado no encontrado.');
    if (current.version !== input.version) throw equipmentConflict();

    const imeiChanged = current.imei !== input.imei;
    if (imeiChanged) {
      const local = await this.prisma.equipment.findFirst({
        where: { imei: input.imei, id: { not: id } },
        select: { id: true },
      });
      if (local) {
        throw new AppError(409, 'DUPLICATE_IMEI', 'Ya existe un equipo con ese IMEI.', {
          existingKeys: [`DB:${local.id}`],
        });
      }
      let catalog;
      try {
        catalog = await this.sheets.getEquipment({ forceFresh: true });
      } catch {
        throw new AppError(
          503,
          'INVENTORY_IMEI_VERIFICATION_PAUSED',
          'No se puede verificar el IMEI en Google Sheets. Conserva los cambios y reintenta.',
        );
      }
      const matches = catalog.data.filter((equipment) => equipment.imei?.trim() === input.imei);
      if (matches.length) {
        throw new AppError(409, 'DUPLICATE_IMEI', 'Ya existe un equipo con ese IMEI.', {
          existingKeys: matches.map((equipment) => equipment.externalKey),
        });
      }
    }

    try {
      return await domainTransaction(this.prisma, async (tx, effects) => {
        const before = await this.requireEquipment(tx, id);
        if (before.version !== input.version) throw equipmentConflict();
        const result = await tx.equipment.updateMany({
          where: { id, version: input.version },
          data: {
            imei: input.imei,
            brand: input.brand,
            model: input.model,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1) throw equipmentConflict();
        const after = await this.requireEquipment(tx, id);
        effects.audit({
          action: 'INVENTORY_EQUIPMENT_UPDATED',
          actorUserId: actor.id,
          entityType: 'Equipment',
          entityId: id,
          before: toManagementEquipment(before) as unknown as Prisma.InputJsonValue,
          after: toManagementEquipment(after) as unknown as Prisma.InputJsonValue,
        });
        return toManagementEquipment(after);
      });
    } catch (error) {
      if (
        imeiChanged &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new AppError(409, 'DUPLICATE_IMEI', 'Ya existe un equipo con ese IMEI.');
      }
      throw error;
    }
  }

  public async remove(
    actor: InventoryActor,
    id: string,
    request: DeleteInventoryEquipment,
  ): Promise<{ deleted: true }> {
    requireAdmin(actor);
    const parsed = v.safeParse(DeleteInventoryEquipmentSchema, request);
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Versión de equipo inválida.');
    return domainTransaction(this.prisma, async (tx, effects) => {
        const before = await this.requireEquipment(tx, id);
        if (before.version !== parsed.output.version) throw equipmentConflict();
        if (!toManagementEquipment(before).canDelete)
          throw new AppError(
            409,
            'INVENTORY_EQUIPMENT_IN_USE',
            'Solo se pueden retirar equipos disponibles y sin reservas.',
          );
        // Keep availability and reservation preconditions in the write: both can race this request.
        const result = await tx.equipment.updateMany({
          where: {
            id,
            version: parsed.output.version,
            state: 'AVAILABLE',
            reservedOrderId: null,
            deletedAt: null,
          },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (result.count !== 1) throw equipmentConflict();

        const draftAssignments = await tx.orderEquipment.findMany({
          where: {
            inventoryEquipmentId: id,
            orderUnit: { order: { status: 'DRAFT' } },
          },
        });
        if (draftAssignments.length > 0) {
          await tx.orderEquipment.deleteMany({
            where: {
              id: { in: draftAssignments.map(({ id: assignmentId }) => assignmentId) },
              orderUnit: { order: { status: 'DRAFT' } },
            },
          });
          for (const assignment of draftAssignments) {
            effects.audit({
              action: 'EQUIPMENT_REMOVED',
              actorUserId: actor.id,
              entityType: 'OrderEquipment',
              entityId: assignment.id,
              before: assignment as unknown as Prisma.InputJsonValue,
            });
          }
        }

        effects.audit({
          action: 'INVENTORY_EQUIPMENT_DELETED',
          actorUserId: actor.id,
          entityType: 'Equipment',
          entityId: id,
          before: toManagementEquipment(before) as unknown as Prisma.InputJsonValue,
        });
        return { deleted: true as const };
      });
  }

  private async requireEquipment(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ManagedEquipmentRow> {
    const equipment = await tx.equipment.findUnique({ where: { id }, select: managementSelection });
    if (!equipment || equipment.deletedAt !== null)
      throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo registrado no encontrado.');
    return equipment;
  }

  public async register(
    actor: { id: string; role: 'ADMIN' | 'TECHNICIAN' },
    request: RegisterEquipment,
  ) {
    if (actor.role !== 'ADMIN')
      throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede registrar equipos.');
    const parsed = v.safeParse(RegisterEquipmentSchema, request);
    if (!parsed.success)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        parsed.issues[0]?.message ?? 'Datos de equipo inválidos.',
      );
    const input = parsed.output;
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = await this.prisma.equipment.findUnique({
      where: { registrationKey: input.registrationKey },
    });
    if (previous) {
      if (previous.createdById !== actor.id || previous.registrationHash !== hash)
        throw new AppError(
          409,
          'REGISTRATION_KEY_REUSED',
          'La solicitud de registro cambió. Inicia un registro nuevo.',
        );
      return toCatalogEquipment(previous);
    }
    let catalog;
    try {
      catalog = await this.sheets.getEquipment({ forceFresh: true });
    } catch {
      throw new AppError(
        503,
        'INVENTORY_REGISTRATION_PAUSED',
        'No se puede verificar el IMEI en Google Sheets. Conserva los datos y reintenta.',
      );
    }
    const local = await this.prisma.equipment.findUnique({ where: { imei: input.imei } });
    const matches = catalog.data.filter((e) => e.imei?.trim() === input.imei);
    if (local || matches.length) {
      throw new AppError(
        409,
        'DUPLICATE_IMEI',
        'Ya existe un equipo con ese IMEI. Selecciona el equipo existente si es compatible con el servicio.',
        {
          existingKeys: [
            ...(local ? [`DB:${local.id}`] : []),
            ...matches.map((e) => e.externalKey),
          ],
        },
      );
    }
    const state = initialEquipmentState(input.serviceType, input.replacementRole);
    try {
      return await domainTransaction(this.prisma, async (tx, effects) => {
        const equipment = await tx.equipment.create({
          data: {
            id: randomUUID(),
            imei: input.imei,
            brand: input.brand,
            model: input.model,
            state,
            registrationKey: input.registrationKey,
            registrationHash: hash,
            createdById: actor.id,
            ...(state === 'INSTALLED'
              ? {
                  currentClientSheetId: input.clientSheetId,
                  currentClientName: input.clientName,
                  unitLabel: input.unit!.label,
                  unitMakeModel: input.unit!.makeModel,
                  unitSerialNumber: input.unit!.serialNumber,
                  unitYear: input.unit!.year ?? null,
                }
              : {}),
          },
        });
        effects.audit({
          action: 'INVENTORY_EQUIPMENT_REGISTERED',
          actorUserId: actor.id,
          entityType: 'Equipment',
          entityId: equipment.id,
          after: equipment as unknown as Prisma.InputJsonValue,
        });
        return toCatalogEquipment(equipment);
      });
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'P2002'
      )
        throw error;
      // The unique constraint is the authority when requests race, not the preflight query.
      const retry = await this.prisma.equipment.findUnique({
        where: { registrationKey: input.registrationKey },
      });
      if (retry?.createdById === actor.id && retry.registrationHash === hash)
        return toCatalogEquipment(retry);
      const existing = await this.prisma.equipment.findUnique({ where: { imei: input.imei } });
      throw new AppError(409, 'DUPLICATE_IMEI', 'Ya existe un equipo con ese IMEI.', {
        existingKeys: existing ? [`DB:${existing.id}`] : [],
      });
    }
  }
}
