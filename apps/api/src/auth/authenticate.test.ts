import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../generated/prisma/client.js';
import { errorHandler } from '../middleware/error-handler.js';
import { authenticate } from './authenticate.js';
import { PrismaPrincipalResolver, type PrincipalResolver } from './principal-resolver.js';
import type { TokenService } from './tokens.js';

describe('authenticate', () => {
  const verifyAccessToken = vi.fn(async () => ({
    role: 'ADMIN' as const,
    sub: 'user-1',
    type: 'access' as const,
  }));
  const resolve = vi.fn<PrincipalResolver['resolve']>();
  const protectedHandler = vi.fn((_request, response) => response.json(_request.auth));
  const app = express();
  app.get(
    '/protected',
    authenticate({ verifyAccessToken } as unknown as TokenService, { resolve }),
    protectedHandler,
  );
  app.use(errorHandler);

  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
  });

  it('uses the current database role instead of the role claim', async () => {
    resolve.mockResolvedValueOnce({ id: 'user-1', role: 'TECHNICIAN' });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: 'user-1', role: 'TECHNICIAN' });
  });

  it('rejects a missing or inactive principal without invoking the handler', async () => {
    resolve.mockResolvedValueOnce(null);

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REVOKED');
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('reports resolver failures as authority unavailability', async () => {
    resolve.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('AUTHORITY_UNAVAILABLE');
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it('rejects an invalid token without consulting current authority', async () => {
    verifyAccessToken.mockRejectedValueOnce(new Error('invalid signature'));

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(resolve).not.toHaveBeenCalled();
    expect(protectedHandler).not.toHaveBeenCalled();
  });
});

describe('PrismaPrincipalResolver', () => {
  it.each([
    { user: null, expected: null },
    { user: { id: 'user-1', role: 'ADMIN', active: false }, expected: null },
    {
      user: { id: 'user-1', role: 'TECHNICIAN', active: true },
      expected: { id: 'user-1', role: 'TECHNICIAN' },
    },
  ])('resolves only active principals', async ({ user, expected }) => {
    const findUnique = vi.fn().mockResolvedValue(user);
    const resolver = new PrismaPrincipalResolver({
      user: { findUnique },
    } as unknown as PrismaClient);

    await expect(resolver.resolve('user-1')).resolves.toEqual(expected);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, role: true, active: true },
    });
  });
});
