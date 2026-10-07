import { createHash, randomUUID } from 'node:crypto';
import * as v from 'valibot';
import {
  initialEquipmentState,
  RegisterEquipmentSchema,
  type RegisterEquipment,
} from '@puk/contracts';
import { domainTransaction } from '../../database/transaction.js';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { EquipmentCatalogPort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import { toCatalogEquipment } from './equipment-catalog.js';

export class InventoryService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheets: EquipmentCatalogPort,
  ) {}

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
