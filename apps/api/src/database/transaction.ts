import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export interface AuditEntry {
  action: string;
  actorUserId?: string;
  after?: Prisma.InputJsonValue;
  before?: Prisma.InputJsonValue;
  entityId?: string;
  entityType: string;
  ipAddress?: string;
  requestId?: string;
}

export interface OutboxEntry {
  idempotencyKey: string;
  nextAttemptAt?: Date;
  operationType: string;
  orderId?: string;
  payload: Prisma.InputJsonValue;
  scheduledFor?: Date;
}

interface TransactionEffects {
  audit(entry: AuditEntry): void;
  enqueue(entry: OutboxEntry): void;
}

export async function domainTransaction<TResult>(
  prisma: PrismaClient,
  work: (transaction: Prisma.TransactionClient, effects: TransactionEffects) => Promise<TResult>,
): Promise<TResult> {
  return prisma.$transaction(async (transaction) => {
    const audits: AuditEntry[] = [];
    const outbox: OutboxEntry[] = [];
    const result = await work(transaction, {
      audit: (entry) => audits.push(entry),
      enqueue: (entry) => outbox.push(entry),
    });

    if (audits.length > 0) await transaction.auditLog.createMany({ data: audits });
    if (outbox.length > 0) await transaction.sheetSyncOperation.createMany({ data: outbox });
    return result;
  });
}
