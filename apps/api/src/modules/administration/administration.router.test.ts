import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { authenticate } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import type { TechniciansService } from '../technicians/index.js';
import type { UsersService } from '../users/index.js';
import type { SyncService, TechnicalReportSyncScheduleService } from '../orders/index.js';
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
  const mockSyncService = {
    listOperations: vi.fn().mockResolvedValue({
      operations: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      summary: {},
    }),
    processPendingOperations: vi.fn().mockResolvedValue(0),
    retryOperation: vi.fn().mockResolvedValue({ id: '93b02dbc-68e6-45f0-9ff7-b0a845a0ef24' }),
  };
  const mockSchedule = {
    getConfig: vi.fn().mockResolvedValue({
      cutoffWeekday: 2,
      nextSyncAt: new Date('2026-09-17T00:00:00.000Z'),
      syncTime: '17:00',
      syncWeekday: 3,
      timeZone: 'America/Hermosillo',
      updatedAt: null,
    }),
    updateConfig: vi.fn().mockImplementation(async (_actor, input) => input),
  };

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(
      '/admin',
      createAdministrationRouter({
        requireAccess: authenticate(mockTokens, {
          resolve: async (userId) => ({ id: userId, role: 'ADMIN' }),
        }),
        usersService: mockUsersService as unknown as UsersService,
        techniciansService: mockTechniciansService as unknown as TechniciansService,
        syncService: mockSyncService as unknown as SyncService,
        technicalReportSyncSchedule: mockSchedule as unknown as TechnicalReportSyncScheduleService,
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

  it('serves the global synchronization dashboard data', async () => {
    const response = await request(createTestApp())
      .get('/admin/sync?status=PENDING&page=1')
      .set('Authorization', 'Bearer valid-token');
    expect(response.status).toBe(200);
    expect(response.body.data.operations).toEqual([]);
    expect(mockSyncService.listOperations).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, status: 'PENDING' }),
    );
  });

  it('updates the configurable weekly schedule', async () => {
    const schedule = {
      cutoffWeekday: 2,
      syncTime: '17:00',
      syncWeekday: 3,
      timeZone: 'America/Hermosillo',
    };
    const response = await request(createTestApp())
      .put('/admin/sync/schedule')
      .set('Authorization', 'Bearer valid-token')
      .send(schedule);
    expect(response.status).toBe(200);
    expect(mockSchedule.updateConfig).toHaveBeenCalledWith('admin-user-id', schedule);
  });
});
