import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { DevMockStorageClient } from '../../integrations/object-storage/dev-mock-storage.client.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { AppError } from '../../shared/errors.js';
import { createExecutionRouter } from './execution.router.js';
import { ExecutionService } from './execution.service.js';

const orderId = '00000000-0000-4000-8000-000000000001';
const foreignOrderId = '00000000-0000-4000-8000-000000000002';
const unitId = '00000000-0000-4000-8000-000000000003';
const equipmentId = '00000000-0000-4000-8000-000000000004';

describe('execution HTTP equipment ownership', () => {
  function harness() {
    const tx = {
      orderEquipment: { update: vi.fn(async () => ({ id: equipmentId })) },
      discrepancy: { create: vi.fn(async () => ({ id: 'discrepancy-1' })) },
      checklist: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({ id: 'checklist-1' })),
      },
      checklistItem: { upsert: vi.fn(async () => ({ id: 'checklist-item-1' })) },
      auditLog: { createMany: vi.fn() },
    };
    const database = {
      order: {
        findUnique: vi.fn(async () => ({
          id: orderId,
          status: 'IN_PROGRESS',
          technicianId: 'tech-1',
        })),
      },
      user: { findUnique: vi.fn(async () => ({ active: true, technicianId: 'tech-1' })) },
      sharedTechnicianAccess: { findUnique: vi.fn(async () => null) },
      orderUnit: { findUnique: vi.fn(async () => ({ id: unitId, orderId: foreignOrderId })) },
      orderEquipment: { findUnique: vi.fn(async () => ({ id: equipmentId, orderUnitId: unitId })) },
      $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const app = express();
    app.use(express.json());
    app.use(
      createExecutionRouter({
        executionService: new ExecutionService(
          database as unknown as PrismaClient,
          new DevMockStorageClient(),
        ),
        // Inject an authenticated principal; routing, validation and order-access policy remain real.
        requireAccess: (req, _res, next) => {
          req.auth = { userId: 'actor-1', role: 'TECHNICIAN' };
          next();
        },
      }),
    );
    app.use(errorHandler);
    return { app, database, tx };
  }

  describe.each(['verify', 'discrepancy'])('%s endpoint', (operation) => {
    it('rejects an existing foreign unit/equipment chain with valid URL parameters', async () => {
      const h = harness();
      const response = await request(h.app)
        .post(`/orders/${orderId}/units/${unitId}/equipment/${equipmentId}/${operation}`)
        .send(
          operation === 'discrepancy'
            ? { type: 'IMEI', description: 'IMEI differs from label' }
            : {},
        );
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('UNIT_NOT_FOUND');
      expect(h.database.user.findUnique).toHaveBeenCalled();
      expect(h.database.orderEquipment.findUnique).not.toHaveBeenCalled();
      expect(h.database.$transaction).not.toHaveBeenCalled();
      expect(h.tx.auditLog.createMany).not.toHaveBeenCalled();
    });

    it('accepts the same URL shape when the full chain belongs to the accessible order', async () => {
      const h = harness();
      h.database.orderUnit.findUnique.mockResolvedValue({ id: unitId, orderId });
      const response = await request(h.app)
        .post(`/orders/${orderId}/units/${unitId}/equipment/${equipmentId}/${operation}`)
        .send(
          operation === 'discrepancy'
            ? { type: 'IMEI', description: 'IMEI differs from label' }
            : {},
        );
      expect(response.status).toBe(operation === 'discrepancy' ? 201 : 200);
      expect(h.database.$transaction).toHaveBeenCalledTimes(1);
      expect(h.tx.auditLog.createMany).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects duplicate checklist categories before authorization reads or writes', async () => {
    const h = harness();
    const response = await request(h.app)
      .put(`/orders/${orderId}/units/${unitId}/checklist`)
      .send({
        items: [
          { category: 'DASHBOARD', condition: 'GOOD' },
          { category: 'DASHBOARD', condition: 'BAD', notes: 'Contradiction' },
        ],
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(h.database.order.findUnique).not.toHaveBeenCalled();
    expect(h.database.$transaction).not.toHaveBeenCalled();
    expect(h.tx.checklistItem.upsert).not.toHaveBeenCalled();
  });

  it('rejects a checklist unit outside the requested order before opening a transaction', async () => {
    const h = harness();
    const response = await request(h.app)
      .put(`/orders/${orderId}/units/${unitId}/checklist`)
      .send({ items: [{ category: 'DASHBOARD', condition: 'GOOD' }] });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('UNIT_NOT_FOUND');
    expect(h.database.orderUnit.findUnique).toHaveBeenCalledWith({ where: { id: unitId } });
    expect(h.database.$transaction).not.toHaveBeenCalled();
    expect(h.tx.checklistItem.upsert).not.toHaveBeenCalled();
  });

  it('accepts partial checklist updates without writing categories that were omitted', async () => {
    const h = harness();
    h.database.orderUnit.findUnique.mockResolvedValue({ id: unitId, orderId });
    const response = await request(h.app)
      .put(`/orders/${orderId}/units/${unitId}/checklist`)
      .send({ items: [{ category: 'DASHBOARD', condition: 'GOOD' }] });
    expect(response.status).toBe(200);
    expect(h.tx.checklistItem.upsert).toHaveBeenCalledTimes(1);
    expect(h.tx.checklistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checklistId_category: { checklistId: 'checklist-1', category: 'DASHBOARD' } },
      }),
    );
  });
});

describe('completeness HTTP actor authorization', () => {
  function harness(role: 'ADMIN' | 'TECHNICIAN' = 'TECHNICIAN', status = 'IN_PROGRESS') {
    const order = { id: orderId, status, technicianId: 'tech-1' };
    const requirementsRead = vi.fn(async () => ({ ...order, units: [], signature: null }));
    const database = {
      order: {
        findUnique: vi
          .fn()
          .mockImplementation(async (args: { include?: { units?: unknown } }) =>
            args.include?.units ? requirementsRead() : order,
          ),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ active: true, technicianId: 'tech-1' }) },
      sharedTechnicianAccess: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    app.use(
      createExecutionRouter({
        executionService: new ExecutionService(
          database as unknown as PrismaClient,
          new DevMockStorageClient(),
        ),
        requireAccess: (req, _res, next) => {
          req.auth = { userId: 'actor-1', role };
          next();
        },
      }),
    );
    app.use(errorHandler);
    return { app, database, requirementsRead };
  }

  it('does not let query/body actors bypass the authenticated unrelated technician', async () => {
    const h = harness();
    h.database.user.findUnique.mockResolvedValue({ active: true, technicianId: 'tech-other' });
    const response = await request(h.app)
      .get(`/orders/${orderId}/completeness?userId=admin-1&role=ADMIN`)
      .send({ userId: 'admin-1', role: 'ADMIN' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(h.requirementsRead).not.toHaveBeenCalled();
    expect(h.database.$transaction).not.toHaveBeenCalled();
  });

  it('returns ORDER_NOT_FOUND without a requirements read for a missing order', async () => {
    const h = harness('ADMIN');
    h.database.order.findUnique.mockImplementation(
      async (args: { include?: { units?: unknown } }) =>
        args.include?.units ? h.requirementsRead() : null,
    );
    const response = await request(h.app).get(`/orders/${orderId}/completeness`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
    expect(h.requirementsRead).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'TECHNICIAN'] as const)(
    'permits %s in DRAFT without introducing a GET execution-state restriction',
    async (role) => {
      const h = harness(role, 'DRAFT');
      const response = await request(h.app).get(`/orders/${orderId}/completeness`);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        isComplete: false,
        missingRequirements: [
          'No hay unidades registradas en la orden',
          'Falta firma y nombre del cliente',
        ],
      });
      expect(h.requirementsRead).toHaveBeenCalledTimes(1);
      expect(h.database.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { state: 'ASSIGNED', allowed: true },
    { state: 'IN_PROGRESS', allowed: true },
    { state: 'REQUIRES_CORRECTION', allowed: true },
    { state: 'DRAFT', allowed: false },
    { state: 'COMPLETED', allowed: false },
    { state: 'CANCELLED', allowed: false },
    { state: 'FAILED_APPOINTMENT', allowed: false },
  ])('preserves shared account access for $state', async ({ state, allowed }) => {
    const h = harness('TECHNICIAN', state);
    h.database.user.findUnique.mockResolvedValue({ active: true, technicianId: null });
    h.database.sharedTechnicianAccess.findUnique.mockResolvedValue({
      userId: 'actor-1',
      orderId: null,
    });
    const response = await request(h.app).get(`/orders/${orderId}/completeness`);
    expect(response.status).toBe(allowed ? 200 : 403);
    if (!allowed) expect(response.body.error.code).toBe('FORBIDDEN');
    expect(h.requirementsRead).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });
});

describe('binary upload HTTP validation order', () => {
  const key = '234edc7a-d596-4b6b-95e4-34107e78485f';
  const endpoints = [
    {
      name: 'evidence',
      method: 'post' as const,
      path: `/orders/${orderId}/units/${unitId}/evidence/file`,
    },
    { name: 'signature', method: 'put' as const, path: `/orders/${orderId}/signature/file` },
  ];

  function harness(authenticated = true) {
    const service = {
      getEvidenceUploadLimit: () => 16,
      getSignatureUploadLimit: () => 16,
      uploadEvidenceFile: vi.fn().mockResolvedValue({ id: 'evidence-1' }),
      uploadSignatureFile: vi.fn().mockResolvedValue({ id: 'signature-1' }),
      completeEvidence: vi.fn().mockResolvedValue({ id: 'evidence-1' }),
    };
    const app = express();
    app.use(
      createExecutionRouter({
        executionService: service as unknown as ExecutionService,
        requireAccess: (req, _res, next) => {
          if (!authenticated)
            return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
          req.auth = { userId: 'actor-1', role: 'TECHNICIAN' };
          next();
        },
      }),
    );
    app.use(errorHandler);
    const assertNoUploads = () => {
      expect(service.uploadEvidenceFile).not.toHaveBeenCalled();
      expect(service.uploadSignatureFile).not.toHaveBeenCalled();
    };
    return { app, service, assertNoUploads };
  }

  describe.each(endpoints)('$name', ({ name, method, path }) => {
    it.each([undefined, '', 'invalid-uuid'])(
      'rejects key %s before processing an oversized file',
      async (invalidKey) => {
        const h = harness();
        const pending = request(h.app)[method](path).set('Content-Type', 'image/png');
        if (invalidKey !== undefined) pending.set('Idempotency-Key', invalidKey);
        const response = await pending.send(Buffer.alloc(17));
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
        h.assertNoUploads();
      },
    );

    it.each([undefined, '', 'invalid-uuid'])(
      'rejects key %s with a within-limit file as a client error',
      async (invalidKey) => {
        const h = harness();
        const pending = request(h.app)[method](path).set('Content-Type', 'image/png');
        if (invalidKey !== undefined) pending.set('Idempotency-Key', invalidKey);
        const response = await pending.send(Buffer.from([1, 2, 3]));
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
        h.assertNoUploads();
      },
    );

    it('rejects malformed order params before an invalid key and oversized file', async () => {
      const h = harness();
      const response = await request(h.app)
        [method](path.replace(orderId, 'not-a-uuid'))
        .set('Content-Type', 'image/png')
        .set('Idempotency-Key', 'invalid-uuid')
        .send(Buffer.alloc(17));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      h.assertNoUploads();
    });

    it('preserves configured binary limit errors when params/key are valid', async () => {
      const h = harness();
      const response = await request(h.app)
        [method](path)
        .set('Content-Type', 'image/png')
        .set('Idempotency-Key', key)
        .send(Buffer.alloc(17));
      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
      h.assertNoUploads();
    });

    it('authenticates before invalid params, key or oversized file checks', async () => {
      const h = harness(false);
      const response = await request(h.app)
        [method](path.replace(orderId, 'not-a-uuid'))
        .set('Content-Type', 'image/png')
        .set('Idempotency-Key', 'invalid-uuid')
        .send(Buffer.alloc(17));
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      h.assertNoUploads();
    });

    it('passes a valid key unchanged with the parsed bytes and authenticated actor at the exact limit', async () => {
      const h = harness();
      const bytes = Buffer.alloc(16, 1);
      const uppercaseKey = key.toUpperCase();
      const response = await request(h.app)
        [method](path)
        .set('Content-Type', 'image/png')
        .set('Idempotency-Key', uppercaseKey)
        .set('X-Signer-Name', 'Client')
        .set('X-Image-Width', '2')
        .set('X-Image-Height', '3')
        .send(bytes);
      expect(response.status).toBe(name === 'evidence' ? 201 : 200);
      if (name === 'evidence') {
        expect(h.service.uploadEvidenceFile).toHaveBeenCalledExactlyOnceWith(
          'actor-1',
          'TECHNICIAN',
          orderId,
          unitId,
          bytes,
          'image/png',
          { width: 2, height: 3 },
          uppercaseKey,
        );
        expect(h.service.uploadSignatureFile).not.toHaveBeenCalled();
      } else {
        expect(h.service.uploadSignatureFile).toHaveBeenCalledExactlyOnceWith(
          'actor-1',
          'TECHNICIAN',
          orderId,
          bytes,
          'Client',
          uppercaseKey,
        );
        expect(h.service.uploadEvidenceFile).not.toHaveBeenCalled();
      }
    });
  });

  it('rejects malformed evidence unit params before header/body processing', async () => {
    const h = harness();
    const response = await request(h.app)
      .post(`/orders/${orderId}/units/not-a-uuid/evidence/file`)
      .set('Content-Type', 'image/png')
      .set('Idempotency-Key', 'invalid-uuid')
      .send(Buffer.alloc(17));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    h.assertNoUploads();
  });

  it('rejects declared evidence dimensions over the pixel limit before accepting the file', async () => {
    const h = harness();
    const response = await request(h.app)
      .post(`/orders/${orderId}/units/${unitId}/evidence/file`)
      .set('Content-Type', 'image/jpeg')
      .set('Idempotency-Key', key)
      .set('X-Image-Width', '8001')
      .set('X-Image-Height', '5000')
      .send(Buffer.from([1]));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_IMAGE_DIMENSION');
    expect(h.service.uploadEvidenceFile).not.toHaveBeenCalled();
  });

  it('rejects invalid declared completion dimensions before the service accepts evidence', async () => {
    const h = harness();
    const response = await request(h.app)
      .post('/evidence/00000000-0000-4000-8000-000000000005/complete')
      .send({ width: 8001, height: 5000 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(h.service.completeEvidence).not.toHaveBeenCalled();
  });
});
