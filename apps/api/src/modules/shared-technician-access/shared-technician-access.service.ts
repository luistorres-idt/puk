import type {
  MeOrderAccessResponse,
  SharedTechnicianAccessConfig,
  UpdateSharedTechnicianAccessAccount,
  UpdateSharedTechnicianAccessOrder,
} from '@puk/contracts';
import { getOrderAccessMode, isSharedAccessStatus } from '../../auth/order-access-policy.js';
import { domainTransaction } from '../../database/transaction.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { UserRole } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

const SINGLETON_ID = 1;

type SharedConfigRecord = {
  id: number;
  userId: string | null;
  orderId: string | null;
  revision: number;
  updatedAt: Date;
};

export class SharedTechnicianAccessService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getConfig(): Promise<SharedTechnicianAccessConfig> {
    return this.toConfig(await this.loadConfig());
  }

  public async updateAccount(
    actorUserId: string,
    input: UpdateSharedTechnicianAccessAccount,
  ): Promise<SharedTechnicianAccessConfig> {
    const updated = await domainTransaction(this.prisma, async (tx, effects) => {
      const current = await lockSharedAccessConfig(tx);
      if (current.revision !== input.expectedRevision) {
        throw new AppError(
          409,
          'ORDER_ACCESS_CHANGED',
          'El acceso compartido cambió. Recargá el contexto e intentá de nuevo.',
        );
      }

      if (input.userId !== null) {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { active: true, role: true, technicianId: true },
        });
        if (
          !user ||
          !user.active ||
          user.role !== UserRole.TECHNICIAN ||
          user.technicianId !== null
        ) {
          throw new AppError(
            400,
            'INVALID_SHARED_TECHNICIAN_ACCOUNT',
            'La cuenta compartida debe ser un técnico activo sin técnico individual asignado.',
          );
        }
      }

      const result = await updateSharedAccessAccount(tx, input.userId);
      effects.audit({
        action: 'SHARED_TECHNICIAN_ACCOUNT_CHANGED',
        actorUserId,
        before: current as unknown as Prisma.InputJsonValue,
        after: result as unknown as Prisma.InputJsonValue,
        context: {
          accessMode: 'SHARED',
          expectedRevision: input.expectedRevision,
          userId: input.userId,
        } as Prisma.InputJsonValue,
        entityId: String(SINGLETON_ID),
        entityType: 'SharedTechnicianAccess',
      });
      return result;
    });
    return this.toConfig(updated);
  }

  public async updateOrder(
    actorUserId: string,
    input: UpdateSharedTechnicianAccessOrder,
  ): Promise<SharedTechnicianAccessConfig> {
    const updated = await domainTransaction(this.prisma, async (tx, effects) => {
      const current = await lockSharedAccessConfig(tx);
      if (current.revision !== input.expectedRevision) {
        throw new AppError(
          409,
          'ORDER_ACCESS_CHANGED',
          'El acceso compartido cambió. Recargá el contexto e intentá de nuevo.',
        );
      }

      if (input.orderId !== null) {
        if (current.userId === null) {
          throw new AppError(
            409,
            'ORDER_NOT_ELIGIBLE_FOR_SHARED_ACCESS',
            'Configurá una cuenta compartida antes de habilitar una orden.',
          );
        }
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
          select: { id: true, status: true, technicianId: true },
        });
        if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Orden no encontrada');
        if (order.technicianId === null || !isSharedAccessStatus(order.status)) {
          throw new AppError(
            409,
            'ORDER_NOT_ELIGIBLE_FOR_SHARED_ACCESS',
            'La orden debe estar asignada a un técnico y en un estado ejecutable.',
          );
        }
      }

      const result = await updateSharedAccessOrder(tx, input.orderId);
      effects.audit({
        action:
          input.orderId === null
            ? 'SHARED_TECHNICIAN_ORDER_REVOKED'
            : 'SHARED_TECHNICIAN_ORDER_ENABLED',
        actorUserId,
        before: current as unknown as Prisma.InputJsonValue,
        after: result as unknown as Prisma.InputJsonValue,
        context: {
          accessMode: 'SHARED',
          expectedRevision: input.expectedRevision,
          orderId: input.orderId,
        } as Prisma.InputJsonValue,
        entityId: String(SINGLETON_ID),
        entityType: 'SharedTechnicianAccess',
      });
      return result;
    });
    return this.toConfig(updated);
  }

  public async getMeOrderAccess(userId: string): Promise<MeOrderAccessResponse> {
    const mode = await getOrderAccessMode(this.prisma, userId);
    if (mode === 'INDIVIDUAL') return { mode, sharedAccess: null };
    const config = await this.loadConfig();
    return {
      mode,
      sharedAccess: {
        userId,
        orderId: config.orderId,
        revision: config.revision,
      },
    };
  }

  private async loadConfig(): Promise<SharedConfigRecord> {
    const config = await findSharedAccessConfig(this.prisma);
    if (config === null) {
      throw new AppError(
        500,
        'SHARED_ACCESS_CONFIG_MISSING',
        'Falta la configuración de acceso compartido.',
      );
    }
    return config;
  }

  private toConfig(config: SharedConfigRecord): SharedTechnicianAccessConfig {
    return {
      id: SINGLETON_ID,
      userId: config.userId,
      orderId: config.orderId,
      revision: config.revision,
      updatedAt: new Date(config.updatedAt).toISOString(),
    };
  }
}

async function lockSharedAccessConfig(tx: Prisma.TransactionClient): Promise<SharedConfigRecord> {
  const rows = await tx.$queryRaw<SharedConfigRecord[]>`
    SELECT "id", "userId", "orderId", "revision", "updatedAt"
    FROM "SharedTechnicianAccess"
    WHERE "id" = ${SINGLETON_ID}
    FOR UPDATE
  `;
  const config = rows[0];
  if (!config) {
    throw new AppError(
      500,
      'SHARED_ACCESS_CONFIG_MISSING',
      'Falta la configuración de acceso compartido.',
    );
  }
  return config;
}

async function findSharedAccessConfig(
  prisma: PrismaClient | Prisma.TransactionClient,
): Promise<SharedConfigRecord | null> {
  return prisma.sharedTechnicianAccess.findUnique({
    where: { id: SINGLETON_ID },
  });
}

async function updateSharedAccessAccount(
  tx: Prisma.TransactionClient,
  userId: string | null,
): Promise<SharedConfigRecord> {
  return tx.sharedTechnicianAccess.update({
    where: { id: SINGLETON_ID },
    data: { userId, orderId: null, revision: { increment: 1 } },
  });
}

async function updateSharedAccessOrder(
  tx: Prisma.TransactionClient,
  orderId: string | null,
): Promise<SharedConfigRecord> {
  return tx.sharedTechnicianAccess.update({
    where: { id: SINGLETON_ID },
    data: { orderId, revision: { increment: 1 } },
  });
}
