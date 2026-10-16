import { createHash } from 'node:crypto';
import type { CreateOrder } from '@puk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function getOrderCreationRequestHash(input: CreateOrder): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(input)))
    .digest('hex');
}

export function toPublicOrder<
  T extends { creationIdempotencyKey: string | null; creationRequestHash: string | null },
>(order: T): Omit<T, 'creationIdempotencyKey' | 'creationRequestHash'> {
  const { creationIdempotencyKey, creationRequestHash, ...publicOrder } = order;
  void creationIdempotencyKey;
  void creationRequestHash;
  return publicOrder;
}

export async function findIdempotentOrder(
  prisma: Pick<PrismaClient, 'order'>,
  actorUserId: string,
  idempotencyKey: string,
  requestHash: string,
) {
  const order = await prisma.order.findUnique({
    where: {
      createdById_creationIdempotencyKey: {
        createdById: actorUserId,
        creationIdempotencyKey: idempotencyKey,
      },
    },
  });
  if (!order) return null;
  if (order.creationRequestHash !== requestHash) {
    throw new AppError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used with a different order payload.',
    );
  }
  return toPublicOrder(order);
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002',
  );
}
