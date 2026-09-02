import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { TokenService } from '../../auth/tokens.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { DevMockSheetsClient } from '../../integrations/google-sheets/dev-mock-sheets.client.js';
import { GoogleSheetsCatalogService } from '../../integrations/google-sheets/google-sheets.service.js';

describe('Catalogs Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let technicianToken: string;

  beforeAll(async () => {
    const tokens = await TokenService.forDevelopment({
      accessTtl: '15m',
      audience: 'test-aud',
      issuer: 'test-iss',
      refreshTtl: '1d',
    });

    adminToken = await tokens.createAccessToken({
      role: 'ADMIN',
      id: '11111111-1111-1111-1111-111111111111',
    });

    technicianToken = await tokens.createAccessToken({
      role: 'TECHNICIAN',
      id: '22222222-2222-2222-2222-222222222222',
    });

    const sheetsPort = new DevMockSheetsClient();
    const catalogsService = new GoogleSheetsCatalogService(sheetsPort, 60);

    app = createApp({
      auth: {
        cookie: { httpOnly: true, maxAge: 1000, path: '/', sameSite: 'lax', secure: false },
        minimumPasswordLength: 12,
        prisma: {} as unknown as PrismaClient,
        tokens,
      },
      catalogsService,
    });
  });

  it('rejects unauthenticated requests to catalog endpoints', async () => {
    const res = await request(app).get('/api/v1/external/clients');
    expect(res.status).toBe(401);
  });

  it('allows authenticated users to query clients and equipment', async () => {
    const clientsRes = await request(app)
      .get('/api/v1/external/clients')
      .set('Authorization', `Bearer ${technicianToken}`);

    expect(clientsRes.status).toBe(200);
    expect(clientsRes.body.data).toBeInstanceOf(Array);
    expect(clientsRes.body.data.length).toBeGreaterThan(0);
    expect(clientsRes.body.meta.fetchedAt).toBeDefined();

    const searchRes = await request(app)
      .get('/api/v1/external/clients?search=Bull')
      .set('Authorization', `Bearer ${technicianToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].name).toContain('Bull Dog');

    const equipmentRes = await request(app)
      .get('/api/v1/external/equipment')
      .set('Authorization', `Bearer ${technicianToken}`);

    expect(equipmentRes.status).toBe(200);
    expect(equipmentRes.body.data.length).toBeGreaterThan(0);
  });

  it('gets individual equipment and handles 404', async () => {
    const eqRes = await request(app)
      .get('/api/v1/external/equipment/EQ-001')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(eqRes.status).toBe(200);
    expect(eqRes.body.data.externalKey).toBe('EQ-001');

    const missingRes = await request(app)
      .get('/api/v1/external/equipment/NON-EXISTENT')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(missingRes.status).toBe(404);
  });

  it('enforces role restrictions on cache refresh', async () => {
    const techRes = await request(app)
      .post('/api/v1/external/refresh')
      .set('Authorization', `Bearer ${technicianToken}`);

    expect(techRes.status).toBe(403);

    const adminRes = await request(app)
      .post('/api/v1/external/refresh')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.refreshed).toBe(true);
  });
});
