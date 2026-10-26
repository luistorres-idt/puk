import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { AppError } from '../../shared/errors.js';
import { createClientsRouter } from './clients.router.js';
import type { ClientsService } from './clients.service.js';

const id = '00000000-0000-4000-8000-000000000001';
const emailId = '00000000-0000-4000-8000-000000000002';
const client = { id, clientSheetId: 'C1', name: 'Client', emails: [] };
const service = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  addEmail: vi.fn(),
  updateEmail: vi.fn(),
  removeEmail: vi.fn(),
};
function app(role: 'ADMIN' | 'TECHNICIAN' = 'ADMIN') {
  const application = express();
  application.use(express.json());
  const tokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: id, role, type: 'access' }),
  } as unknown as TokenService;
  application.use(
    '/clients',
    createClientsRouter(
      service as unknown as ClientsService,
      authenticate(tokens, { resolve: async (userId) => ({ id: userId, role }) }),
    ),
  );
  application.use(errorHandler);
  return application;
}
const operations = [
  ['get', '/clients', undefined, 'list'],
  ['get', `/clients/${id}`, undefined, 'get'],
  ['post', '/clients', { name: 'Client' }, 'create'],
  ['post', '/clients', { clientSheetId: 'C1', name: 'Client' }, 'create'],
  ['patch', `/clients/${id}`, { name: 'Renamed' }, 'update'],
  ['post', `/clients/${id}/emails`, { email: ' A@Example.com ' }, 'addEmail'],
  ['patch', `/clients/${id}/emails/${emailId}`, { email: 'b@example.com' }, 'updateEmail'],
  ['delete', `/clients/${id}/emails/${emailId}`, undefined, 'removeEmail'],
] as const;
describe('ADMIN client HTTP management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const mock of Object.values(service)) mock.mockResolvedValue(client);
  });
  it.each(operations)('serves ADMIN %s %s', async (method, path, body, operation) => {
    const call = request(app())[method](path).set('Authorization', 'Bearer test');
    const response = await (body ? call.send(body) : call);
    expect(response.status).toBe(method === 'post' ? 201 : 200);
    expect(response.body.data).toEqual(client);
    expect(service[operation]).toHaveBeenCalledOnce();
  });
  it.each(operations)(
    'rejects unauthenticated %s %s before any service call',
    async (method, path, body) => {
      const call = request(app())[method](path);
      const response = await (body ? call.send(body) : call);
      expect(response.status).toBe(401);
      for (const mock of Object.values(service)) expect(mock).not.toHaveBeenCalled();
    },
  );
  it.each(operations)(
    'rejects TECHNICIAN %s %s before validation or service calls',
    async (method, path) => {
      const response = await request(app('TECHNICIAN'))
        [method](path)
        .set('Authorization', 'Bearer test')
        .send({ invalid: true });
      expect(response.status).toBe(403);
      for (const mock of Object.values(service)) expect(mock).not.toHaveBeenCalled();
    },
  );
  it('accepts a name-only client without requiring an external identity', async () => {
    const response = await request(app())
      .post('/clients')
      .set('Authorization', 'Bearer test')
      .send({ name: ' Local client ' });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(id, { name: 'Local client' });
  });
  it('normalizes recipient inputs before passing them to the service', async () => {
    await request(app())
      .post(`/clients/${id}/emails`)
      .set('Authorization', 'Bearer test')
      .send({ email: ' A@Example.com ' });
    expect(service.addEmail).toHaveBeenCalledWith(id, id, { email: 'a@example.com' });
  });
  it('rejects invalid body, UUID, email and identifier mutation', async () => {
    const application = app();
    for (const [method, path, body] of [
      ['post', '/clients', { name: ' ' }],
      ['get', '/clients/not-uuid', {}],
      ['post', `/clients/${id}/emails`, { email: 'invalid' }],
      ['patch', `/clients/${id}`, { name: 'Client', clientSheetId: 'OTHER' }],
    ] as const) {
      expect(
        (await request(application)[method](path).set('Authorization', 'Bearer test').send(body))
          .status,
      ).toBe(400);
    }
    for (const mock of Object.values(service)) expect(mock).not.toHaveBeenCalled();
  });
  it('preserves domain 404/409 responses', async () => {
    service.get.mockRejectedValueOnce(
      new AppError(404, 'CLIENT_NOT_FOUND', 'El cliente no existe.'),
    );
    service.addEmail.mockRejectedValueOnce(
      new AppError(409, 'CLIENT_EMAIL_ALREADY_EXISTS', 'El correo ya existe.'),
    );
    expect(
      (await request(app()).get(`/clients/${id}`).set('Authorization', 'Bearer test')).body.error
        .code,
    ).toBe('CLIENT_NOT_FOUND');
    expect(
      (
        await request(app())
          .post(`/clients/${id}/emails`)
          .set('Authorization', 'Bearer test')
          .send({ email: 'a@example.com' })
      ).status,
    ).toBe(409);
  });
});
