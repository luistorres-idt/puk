import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createInventoryRouter } from './inventory.router.js';
import type { InventoryService } from './inventory.service.js';
import { errorHandler } from '../../middleware/error-handler.js';
const input = {
  registrationKey: '11111111-1111-4111-8111-111111111111',
  brand: 'GPS',
  model: 'Model',
  imei: '123456789012345',
  serviceType: 'INSTALLATION',
  clientSheetId: 'C1',
  clientName: 'Client',
};
function app(role: 'ADMIN' | 'TECHNICIAN') {
  const register = vi.fn().mockResolvedValue({ source: 'DB', externalKey: 'DB:test' });
  const application = express();
  application.use(express.json());
  application.use(
    createInventoryRouter({ register } as unknown as InventoryService, (req, _res, next) => {
      req.auth = { userId: 'actor', role };
      next();
    }),
  );
  application.use(errorHandler);
  return { application, register };
}
describe('inventory authorization boundary', () => {
  it('denies technician writes even with valid payload', async () => {
    const f = app('TECHNICIAN');
    expect((await request(f.application).post('/equipment').send(input)).status).toBe(403);
    expect(f.register).not.toHaveBeenCalled();
  });
  it('rejects invalid IMEI before calling service', async () => {
    const f = app('ADMIN');
    expect(
      (
        await request(f.application)
          .post('/equipment')
          .send({ ...input, imei: 'bad' })
      ).status,
    ).toBe(400);
    expect(f.register).not.toHaveBeenCalled();
  });
  it('registers with authenticated actor and trimmed fields', async () => {
    const f = app('ADMIN');
    expect(
      (
        await request(f.application)
          .post('/equipment')
          .send({ ...input, brand: ' GPS ' })
      ).status,
    ).toBe(201);
    expect(f.register).toHaveBeenCalledWith(
      { id: 'actor', role: 'ADMIN' },
      expect.objectContaining({ brand: 'GPS' }),
    );
  });
});
