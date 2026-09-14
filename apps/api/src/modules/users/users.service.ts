import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { assertPasswordPolicy, hashPassword } from '../../auth/password.js';
import { AppError } from '../../shared/errors.js';

const publicUserSelect = {
  active: true,
  createdAt: true,
  email: true,
  id: true,
  name: true,
  role: true,
  technicianId: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export class UsersService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly minimumPasswordLength: number,
  ) {}

  public list() {
    return this.prisma.user.findMany({ orderBy: { name: 'asc' }, select: publicUserSelect });
  }

  public async create(
    actorUserId: string,
    input: {
      email: string;
      name: string;
      password: string;
      role: 'ADMIN' | 'TECHNICIAN';
      technicianId?: string | null;
    },
  ) {
    this.checkPassword(input.password);
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          role: input.role,
          technicianId: input.technicianId ?? null,
        },
        select: publicUserSelect,
      });
      await transaction.auditLog.create({
        data: {
          action: 'USER_CREATED',
          actorUserId,
          after: user,
          entityId: user.id,
          entityType: 'User',
        },
      });
      return user;
    });
  }

  public async update(
    actorUserId: string,
    id: string,
    input: Partial<{
      active: boolean;
      email: string;
      name: string;
      password: string;
      role: 'ADMIN' | 'TECHNICIAN';
      technicianId: string | null;
    }>,
  ) {
    const existing = await this.prisma.user.findUnique({ select: publicUserSelect, where: { id } });
    if (existing === null) throw new AppError(404, 'USER_NOT_FOUND', 'The user was not found.');
    const passwordHash =
      input.password === undefined
        ? undefined
        : (this.checkPassword(input.password), await hashPassword(input.password));

    return this.prisma.$transaction(async (transaction) => {
      if (transaction.sharedTechnicianAccess) {
        const shared = await transaction.sharedTechnicianAccess.findUnique({
          where: { id: 1 },
        });
        if (shared?.userId === id) {
          if (
            (input.role !== undefined && input.role !== existing.role) ||
            (input.technicianId !== undefined && input.technicianId !== null)
          ) {
            throw new AppError(
              400,
              'INVALID_SHARED_TECHNICIAN_ACCOUNT',
              'No se puede cambiar el rol o asignar técnico individual a la cuenta técnica compartida designada.',
            );
          }
          if (input.active === false && existing.active) {
            await transaction.sharedTechnicianAccess.update({
              where: { id: 1 },
              data: { orderId: null, revision: { increment: 1 } },
            });
          }
        }
      }

      const user = await transaction.user.update({
        data: {
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(passwordHash === undefined ? {} : { passwordHash }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.technicianId === undefined ? {} : { technicianId: input.technicianId }),
        },
        select: publicUserSelect,
        where: { id },
      });
      if (!user.active) {
        await transaction.refreshSession.updateMany({
          data: { revokedAt: new Date() },
          where: { userId: id, revokedAt: null },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'USER_UPDATED',
          actorUserId,
          after: user,
          before: existing,
          entityId: id,
          entityType: 'User',
        },
      });
      return user;
    });
  }

  private checkPassword(password: string): void {
    try {
      assertPasswordPolicy(password, { minimumLength: this.minimumPasswordLength });
    } catch {
      throw new AppError(
        400,
        'PASSWORD_POLICY_VIOLATION',
        `Password must contain at least ${this.minimumPasswordLength} characters.`,
      );
    }
  }
}
