import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

type TechnicianInput = {
  active?: boolean;
  address?: string | null;
  city?: string | null;
  name?: string;
  phone?: string | null;
  state?: string | null;
  workshop?: string | null;
};

export class TechniciansService {
  public constructor(private readonly prisma: PrismaClient) {}

  public list() {
    return this.prisma.technician.findMany({ orderBy: { name: 'asc' } });
  }

  public async create(actorUserId: string, input: TechnicianInput & { name: string }) {
    return this.prisma.$transaction(async (transaction) => {
      const technician = await transaction.technician.create({
        data: { ...cleanData(input), name: input.name },
      });
      await transaction.auditLog.create({
        data: {
          action: 'TECHNICIAN_CREATED',
          actorUserId,
          after: technician,
          entityId: technician.id,
          entityType: 'Technician',
        },
      });
      return technician;
    });
  }

  public async update(actorUserId: string, id: string, input: TechnicianInput) {
    const existing = await this.prisma.technician.findUnique({ where: { id } });
    if (existing === null)
      throw new AppError(404, 'TECHNICIAN_NOT_FOUND', 'The technician was not found.');
    return this.prisma.$transaction(async (transaction) => {
      const technician = await transaction.technician.update({
        data: cleanData(input),
        where: { id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'TECHNICIAN_UPDATED',
          actorUserId,
          after: technician,
          before: existing,
          entityId: id,
          entityType: 'Technician',
        },
      });
      return technician;
    });
  }
}

function cleanData(input: TechnicianInput): TechnicianInput {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as TechnicianInput;
}
