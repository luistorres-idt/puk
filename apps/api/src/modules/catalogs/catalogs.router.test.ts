import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import type { CatalogServicePort } from '../../integrations/ports.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { createCatalogsRouter } from './catalogs.router.js';

const client = { id: 'DB:local', name: 'Stored client' };
function setup(data: (typeof client)[], sheetsAvailable?: boolean) {
  const getClients = vi.fn().mockResolvedValue({
    data,
    fetchedAt: '2026-10-26T12:00:00.000Z',
    ...(sheetsAvailable === undefined ? {} : { sheetsAvailable }),
  });
  const app = express();
  const tokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: 'admin', role: 'ADMIN', type: 'access' }),
  } as unknown as TokenService;
  app.use(
    '/external',
    createCatalogsRouter({
      catalogsService: { getClients } as unknown as CatalogServicePort,
      requireAccess: authenticate(tokens, { resolve: async (id) => ({ id, role: 'ADMIN' }) }),
    }),
  );
  app.use(errorHandler);
  return { app, getClients };
}

describe('client catalog HTTP availability metadata', () => {
  it.each([{ clients: [client] }, { clients: [] }])(
    'returns a successful partial catalog with explicit degraded metadata: $clients',
    async ({ clients }) => {
      const { app } = setup(clients, false);
      const response = await request(app)
        .get('/external/clients')
        .set('Authorization', 'Bearer test');
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(clients);
      expect(response.body.meta).toMatchObject({ sheetsAvailable: false, total: clients.length });
    },
  );
  it('preserves healthy availability and search parameters', async () => {
    const { app, getClients } = setup([client], true);
    const response = await request(app)
      .get('/external/clients?search=Stored')
      .set('Authorization', 'Bearer test');
    expect(response.body.meta.sheetsAvailable).toBe(true);
    expect(getClients).toHaveBeenCalledWith({ search: 'Stored' });
  });
  it('does not invent degraded status for a legacy catalog without metadata', async () => {
    const { app } = setup([client]);
    const response = await request(app)
      .get('/external/clients')
      .set('Authorization', 'Bearer test');
    expect(response.status).toBe(200);
    expect(response.body.meta).not.toHaveProperty('sheetsAvailable');
  });
});
