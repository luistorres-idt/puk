import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { TokenService } from '../../auth/tokens.js';
import type { TechniciansService } from '../technicians/index.js';
import type { UsersService } from '../users/index.js';
import { createAdministrationRouter } from './administration.router.js';

describe('createAdministrationRouter', () => {
  const mockTokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({
      role: 'ADMIN',
      sub: 'admin-user-id',
      type: 'access',
    }),
  } as unknown as TokenService;

  const mockUsersService = {
    list: vi
      .fn()
      .mockResolvedValue([
        { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'ADMIN', active: true },
      ]),
    create: vi.fn().mockResolvedValue({
      id: 'user-2',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'TECHNICIAN',
      active: true,
    }),
    update: vi.fn(),
  };

  const mockTechniciansService = {
    getLastSyncAt: vi.fn().mockReturnValue(null),
    listSelectable: vi
      .fn()
      .mockResolvedValue([{ id: 'tech-1', name: 'Carlos', workshop: 'Norte', city: 'Ciudad' }]),
    list: vi
      .fn()
      .mockResolvedValue([{ id: 'tech-1', name: 'Carlos', active: true, workshop: 'Norte' }]),
    create: vi.fn().mockResolvedValue({
      id: 'tech-2',
      name: 'Daniel',
      active: true,
      workshop: 'Sur',
    }),
    update: vi.fn(),
  };

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(
      '/admin',
      createAdministrationRouter({
        tokens: mockTokens,
        usersService: mockUsersService as unknown as UsersService,
        techniciansService: mockTechniciansService as unknown as TechniciansService,
      }),
    );
    return app;
  }

  it('lists users via injected UsersService', async () => {
    const app = createTestApp();
    const response = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: 'user-1', name: 'Alice', email: 'alice@example.com', role: 'ADMIN', active: true },
    ]);
    expect(mockUsersService.list).toHaveBeenCalled();
  });

  it('lists technicians via injected TechniciansService', async () => {
    const app = createTestApp();
    const response = await request(app)
      .get('/admin/technicians')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: 'tech-1', name: 'Carlos', active: true, workshop: 'Norte' },
    ]);
    expect(mockTechniciansService.list).toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    const app = createTestApp();
    const response = await request(app).get('/admin/users');
    expect(response.status).toBe(401);
  });

  it('serves the dedicated technician selector', async () => {
    const response = await request(createTestApp())
      .get('/admin/technicians/selectable')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: 'tech-1', name: 'Carlos', workshop: 'Norte', city: 'Ciudad' },
    ]);
    expect(mockTechniciansService.listSelectable).toHaveBeenCalledOnce();
  });
});
