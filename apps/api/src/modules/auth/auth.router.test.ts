import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import type { PrincipalResolver } from '../../auth/principal-resolver.js';
import type { TokenService } from '../../auth/tokens.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

describe('auth route protection', () => {
  const verifyAccessToken = vi.fn().mockResolvedValue({
    role: 'ADMIN',
    sub: 'user-1',
    type: 'access',
  });
  const resolve = vi.fn<PrincipalResolver['resolve']>();
  const updateMany = vi.fn();
  const app = createApp({
    auth: {
      cookie: { httpOnly: true, path: '/', sameSite: 'lax', secure: false },
      minimumPasswordLength: 12,
      principalResolver: { resolve },
      prisma: {
        refreshSession: { updateMany },
      } as unknown as PrismaClient,
      tokens: { verifyAccessToken } as unknown as TokenService,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
  });

  it.each([
    { path: '/api/v1/auth/login', body: {}, expectedStatus: 400 },
    { path: '/api/v1/auth/refresh', body: undefined, expectedStatus: 401 },
    { path: '/api/v1/auth/logout', body: undefined, expectedStatus: 200 },
  ])('keeps $path public', async ({ path, body, expectedStatus }) => {
    const pendingRequest = request(app).post(path);
    const response = body === undefined ? await pendingRequest : await pendingRequest.send(body);

    expect(response.status).toBe(expectedStatus);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'get' as const, path: '/api/v1/auth/me' },
    { method: 'post' as const, path: '/api/v1/auth/logout-all' },
  ])('protects $path with live-principal authentication', async ({ method, path }) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('blocks logout-all when the access token principal was deactivated', async () => {
    resolve.mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_REVOKED');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
