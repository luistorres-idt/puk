import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { SheetsPort } from '../../integrations/ports.js';
import { AppError } from '../../shared/errors.js';
import {
  allocateNextTechnicianId,
  parseTechnicianDirectoryRows,
} from './directory-parser.js';

type TechnicianInput = {
  active?: boolean;
  address?: string | null;
  city?: string | null;
  departureCost?: Prisma.Decimal | string | number | null;
  email?: string | null;
  externalKey?: string | null;
  failedAppointmentRate?: Prisma.Decimal | string | number | null;
  fuelSensorRate?: Prisma.Decimal | string | number | null;
  installationRate?: Prisma.Decimal | string | number | null;
  invoice?: string | null;
  legalName?: string | null;
  name?: string;
  notes?: string | null;
  phone?: string | null;
  replacementRate?: Prisma.Decimal | string | number | null;
  reviewRate?: Prisma.Decimal | string | number | null;
  state?: string | null;
  taxAddress?: string | null;
  taxData?: string | null;
  uninstallationRate?: Prisma.Decimal | string | number | null;
  workshop?: string | null;
};

export class TechniciansService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly sheetsPort?: SheetsPort,
  ) {}

  public list() {
    return this.prisma.technician.findMany({ orderBy: { name: 'asc' } });
  }

  public listSelectable() {
    return this.prisma.technician.findMany({
      where: { active: true },
      select: { id: true, name: true, workshop: true, city: true },
      orderBy: { name: 'asc' },
    });
  }

  public async create(actorUserId: string, input: TechnicianInput & { name: string }) {
    let externalKey = input.externalKey;
    if (!externalKey) {
      const existing = await this.prisma.technician.findMany({
        where: { externalKey: { not: null } },
        select: { externalKey: true },
      });
      const keys = existing.map((t) => t.externalKey!).filter(Boolean);
      externalKey = allocateNextTechnicianId(keys);
    }

    return this.prisma.$transaction(async (transaction) => {
      const data = cleanData({ ...input, externalKey }) as Prisma.TechnicianCreateInput;
      const technician = await transaction.technician.create({
        data: { ...data, name: input.name },
      });
      await transaction.auditLog.create({
        data: {
          action: 'TECHNICIAN_CREATED',
          actorUserId,
          after: technician as unknown as Prisma.InputJsonValue,
          entityId: technician.id,
          entityType: 'Technician',
        },
      });
      return technician;
    });
  }

  public async update(actorUserId: string, id: string, input: TechnicianInput) {
    const existing = await this.prisma.technician.findUnique({ where: { id } });
    if (existing === null) {
      throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'The technician was not found.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const technician = await transaction.technician.update({
        data: cleanData(input),
        where: { id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'TECHNICIAN_UPDATED',
          actorUserId,
          after: technician as unknown as Prisma.InputJsonValue,
          before: existing as unknown as Prisma.InputJsonValue,
          entityId: id,
          entityType: 'Technician',
        },
      });
      return technician;
    });
  }

  public async syncFromSheets(actorUserId?: string) {
    if (!this.sheetsPort) {
      return { synced: 0, deactivated: 0, message: 'No Sheets port configured' };
    }

    const rawRows = await this.sheetsPort.listTechniciansDirectory();
    const parseResult = parseTechnicianDirectoryRows(rawRows);

    return this.prisma.$transaction(async (transaction) => {
      const incomingKeys = new Set<string>();
      let syncedCount = 0;

      for (const t of parseResult.technicians) {
        incomingKeys.add(t.externalKey);

        const data: Prisma.TechnicianUpdateInput = {
          name: t.name,
          workshop: t.workshop,
          legalName: t.legalName,
          phone: t.phone,
          email: t.email,
          address: t.address,
          city: t.city,
          state: t.state,
          invoice: t.invoice,
          taxData: t.taxData,
          taxAddress: t.taxAddress,
          departureCost: toDecimal(t.departureCost),
          replacementRate: toDecimal(t.replacementRate),
          installationRate: toDecimal(t.installationRate),
          reviewRate: toDecimal(t.reviewRate),
          uninstallationRate: toDecimal(t.uninstallationRate),
          failedAppointmentRate: toDecimal(t.failedAppointmentRate),
          fuelSensorRate: toDecimal(t.fuelSensorRate),
          notes: t.notes,
          active: true,
        };

        const existing = await transaction.technician.findUnique({
          where: { externalKey: t.externalKey },
        });

        if (existing) {
          await transaction.technician.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await transaction.technician.create({
            data: {
              ...data,
              externalKey: t.externalKey,
              name: t.name,
            } as Prisma.TechnicianCreateInput,
          });
        }
        syncedCount++;
      }

      // Deactivate retired technicians (those with externalKey not in incomingKeys)
      const deactivatedResult = await transaction.technician.updateMany({
        where: {
          externalKey: { notIn: Array.from(incomingKeys), not: null },
          active: true,
        },
        data: { active: false },
      });

      if (actorUserId) {
        await transaction.auditLog.create({
          data: {
            action: 'TECHNICIANS_SYNCED_FROM_SHEETS',
            actorUserId,
            entityType: 'TechnicianCatalog',
            after: {
              synced: syncedCount,
              deactivated: deactivatedResult.count,
              maxExternalId: parseResult.maxExternalId,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return {
        synced: syncedCount,
        deactivated: deactivatedResult.count,
        maxExternalId: parseResult.maxExternalId,
      };
    });
  }
}

function toDecimal(parsedRate: { isValid: boolean; value: string | null }): Prisma.Decimal | null {
  if (!parsedRate.isValid || parsedRate.value === null) {
    return null;
  }
  return new Prisma.Decimal(parsedRate.value);
}

function toDecimalInput(val?: Prisma.Decimal | string | number | null): Prisma.Decimal | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val === '') return null;
  return new Prisma.Decimal(val);
}

function cleanData(input: TechnicianInput): Prisma.TechnicianUpdateInput {
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (
      key === 'departureCost' ||
      key === 'replacementRate' ||
      key === 'installationRate' ||
      key === 'reviewRate' ||
      key === 'uninstallationRate' ||
      key === 'failedAppointmentRate' ||
      key === 'fuelSensorRate'
    ) {
      data[key] = toDecimalInput(value as Prisma.Decimal | string | number | null);
    } else {
      data[key] = value;
    }
  }

  return data as Prisma.TechnicianUpdateInput;
}
