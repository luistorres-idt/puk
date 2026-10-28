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
  const list = vi.fn().mockResolvedValue([]);
  const update = vi.fn().mockResolvedValue({ id: 'test' });
  const remove = vi.fn().mockResolvedValue({ deleted: true });
  const application = express();
  application.use(express.json());
  application.use(
    createInventoryRouter(
      { register, list, update, remove } as unknown as InventoryService,
      (req, _res, next) => {
        req.auth = { userId: 'actor', role };
        next();
      },
    ),
  );
  application.use(errorHandler);
  return { application, register, list, update, remove };
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

const equipmentId = '11111111-1111-4111-8111-111111111111';
describe('equipment management routes', () => {
  it('lists with authenticated admin actor', async () => {
    const f = app('ADMIN');
    expect((await request(f.application).get('/equipment')).status).toBe(200);
    expect(f.list).toHaveBeenCalledWith({ id: 'actor', role: 'ADMIN' });
  });
  it.each(['get', 'patch', 'delete'] as const)('denies technician %s', async (method) => {
    const f = app('TECHNICIAN');
    const path = method === 'get' ? '/equipment' : `/equipment/${equipmentId}`;
    expect(
      (
        await request(f.application)[method](path).send({
          imei: '012345678901234',
          brand: 'A',
          model: 'B',
          version: 1,
        })
      ).status,
    ).toBe(403);
    expect(f.list).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('updates trimmed metadata and passes delete version', async () => {
    const f = app('ADMIN');
    expect(
      (
        await request(f.application)
          .patch(`/equipment/${equipmentId}`)
          .send({ imei: ' 012345678901234 ', brand: ' A ', model: ' B ', version: 3 })
      ).status,
    ).toBe(200);
    expect(f.update).toHaveBeenCalledWith({ id: 'actor', role: 'ADMIN' }, equipmentId, {
      imei: '012345678901234',
      brand: 'A',
      model: 'B',
      version: 3,
    });
    expect(
      (await request(f.application).delete(`/equipment/${equipmentId}`).send({ version: 3 }))
        .status,
    ).toBe(200);
    expect(f.remove).toHaveBeenCalledWith({ id: 'actor', role: 'ADMIN' }, equipmentId, {
      version: 3,
    });
  });
  it('rejects malformed ids, missing version and forbidden fields before the service', async () => {
    const f = app('ADMIN');
    expect(
      (
        await request(f.application)
          .patch('/equipment/bad')
          .send({ imei: '012345678901234', brand: 'A', model: 'B', version: 1 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(f.application)
          .patch(`/equipment/${equipmentId}`)
          .send({ imei: '012345678901234', brand: 'A', model: 'B', version: 1, state: 'INSTALLED' })
      ).status,
    ).toBe(400);
    expect((await request(f.application).delete(`/equipment/${equipmentId}`).send({})).status).toBe(
      400,
    );
    expect(f.update).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
});
