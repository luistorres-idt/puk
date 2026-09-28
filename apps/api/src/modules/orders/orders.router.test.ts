import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderServiceTypeSchema } from '@puk/contracts';
import { authenticate } from '../../auth/authenticate.js';
import type { PrincipalResolver } from '../../auth/principal-resolver.js';
import type { TokenService } from '../../auth/tokens.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { createOrdersRouter } from './orders.router.js';
import { OrdersService } from './orders.service.js';
import type { OrderPricingService } from './order-pricing.service.js';

const technicianId = '00000000-0000-4000-8000-000000000001';
const orderId = '00000000-0000-4000-8000-000000000002';
const unitId = '00000000-0000-4000-8000-000000000003';
const input = {
  clientNameSnapshot: 'Cliente de prueba',
  clientSheetId: 'CLIENT-DEMO',
  scheduledAt: '2026-09-08T18:00:00.000Z',
  serviceType: 'INSTALLATION',
  technicianId,
};
const verifyAccessToken = vi.fn<() => Promise<{ role: 'ADMIN' | 'TECHNICIAN'; sub: string }>>(
  async () => ({ role: 'ADMIN', sub: 'admin-demo' }),
);
const resolvePrincipal = vi.fn<PrincipalResolver['resolve']>(async (userId) => ({
  id: userId,
  role: 'ADMIN',
}));

describe('order HTTP validation', () => {
  const transaction = {
    order: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: orderId,
        ...data,
      })),
    },
    orderUnit: { create: vi.fn(async () => ({ id: unitId })) },
    orderEquipment: { create: vi.fn(async () => ({ id: 'equipment-demo' })) },
    auditLog: { createMany: vi.fn() },
  };
  const database = {
    $transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
    technician: { findUnique: vi.fn() },
    order: { findUnique: vi.fn() },
    orderUnit: { findUnique: vi.fn() },
    orderEquipment: { findFirst: vi.fn() },
  };
  const mockOrderPricingService = {
    updateOrderPricing: vi.fn(),
  };
  const app = express();
  app.use(express.json());
  app.use(
    '/orders',
    createOrdersRouter({
      requireAccess: authenticate({ verifyAccessToken } as unknown as TokenService, {
        resolve: resolvePrincipal,
      }),
      ordersService: new OrdersService(database as unknown as PrismaClient),
      orderPricingService: mockOrderPricingService as unknown as OrderPricingService,
    }),
  );
  app.use(errorHandler);

  beforeEach(() => {
    vi.clearAllMocks();
    verifyAccessToken.mockResolvedValue({ role: 'ADMIN', sub: 'admin-demo' });
    resolvePrincipal.mockImplementation(async (userId) => ({ id: userId, role: 'ADMIN' }));
    database.technician.findUnique.mockResolvedValue({ id: technicianId, active: true });
    database.orderUnit.findUnique.mockResolvedValue(null);
    database.orderEquipment.findFirst.mockResolvedValue(null);
  });

  it('serves the explicit execution endpoint', async () => {
    database.order.findUnique
      .mockResolvedValueOnce({ id: orderId, status: 'ASSIGNED', technicianId })
      .mockResolvedValueOnce({
        id: orderId,
        folio: 'OS-DEMO',
        status: 'ASSIGNED',
        serviceType: 'INSTALLATION',
        clientNameSnapshot: 'Client',
        scheduledAt: new Date('2026-09-14T18:00:00.000Z'),
        isHomeService: false,
        serviceAddress: null,
        generalNotes: null,
        correctionReason: null,
        technician: { id: technicianId, name: 'Technician' },
        units: [],
        signature: null,
      });

    const response = await request(app)
      .get(`/orders/${orderId}/execution`)
      .set('Authorization', 'Bearer test-session');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: orderId, folio: 'OS-DEMO' });
  });

  it('reserves the administrative detail endpoint for administrators', async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: 'admin-demo', role: 'TECHNICIAN' });

    const response = await request(app)
      .get(`/orders/${orderId}`)
      .set('Authorization', 'Bearer test-session');

    expect(response.status).toBe(403);
    expect(database.order.findUnique).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'invalid'])(
    'rejects technicianId %s before persistence',
    async (value) => {
      const response = await request(app)
        .post('/orders')
        .set('Authorization', 'Bearer test-session')
        .send({ ...input, technicianId: value });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { issues: [{ path: 'technicianId', message: expect.any(String) }] },
      });
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { technician: null, status: 404, code: 'TECHNICIAN_NOT_FOUND' },
    { technician: { id: technicianId, active: false }, status: 400, code: 'TECHNICIAN_INACTIVE' },
  ])('rejects $code through the API', async ({ technician, status, code }) => {
    database.technician.findUnique.mockResolvedValue(technician);
    const response = await request(app)
      .post('/orders')
      .set('Authorization', 'Bearer test-session')
      .send(input);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('creates a draft with its selected technician', async () => {
    const response = await request(app)
      .post('/orders')
      .set('Authorization', 'Bearer test-session')
      .send(input);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'DRAFT', technicianId });
    expect(transaction.auditLog.createMany).toHaveBeenCalledOnce();
  });

  it('rejects removing the technician via PATCH', async () => {
    const response = await request(app)
      .patch(`/orders/${orderId}`)
      .set('Authorization', 'Bearer test-session')
      .send({ technicianId: null, version: 1 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it.each(OrderServiceTypeSchema.options)(
    'allows additions through both HTTP endpoints in draft for %s',
    async (serviceType) => {
      database.order.findUnique.mockResolvedValue({ id: orderId, status: 'DRAFT', serviceType });
      const unit = await request(app)
        .post(`/orders/${orderId}/units`)
        .set('Authorization', 'Bearer test-session')
        .send({ label: 'Unidad', makeModel: 'Modelo', serialNumber: 'SERIAL-DEMO', serviceType });
      database.orderUnit.findUnique.mockResolvedValue({ id: unitId, orderId });
      const equipment = await request(app)
        .post(`/orders/${orderId}/units/${unitId}/equipment`)
        .set('Authorization', 'Bearer test-session')
        .send({ externalKey: 'EQ-DEMO' });
      for (const response of [unit, equipment]) {
        expect(response.status).toBe(201);
      }
    },
  );

  it('updates order pricing overrides via PATCH /orders/:id/pricing as ADMIN', async () => {
    mockOrderPricingService.updateOrderPricing.mockResolvedValue({
      id: orderId,
      pricingOverrides: {
        rates: { INSTALLATION: '850.00' },
        travelExpenses: '400.00',
      },
    });

    const response = await request(app)
      .patch(`/orders/${orderId}/pricing`)
      .set('Authorization', 'Bearer test-session')
      .send({
        rates: { INSTALLATION: '850.00' },
        travelExpenses: '400.00',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.pricingOverrides).toEqual({
      rates: { INSTALLATION: '850.00' },
      travelExpenses: '400.00',
    });
    expect(mockOrderPricingService.updateOrderPricing).toHaveBeenCalledWith(
      'admin-demo',
      orderId,
      {
        rates: { INSTALLATION: '850.00' },
        travelExpenses: '400.00',
      },
    );
  });

  it('rejects pricing update via PATCH /orders/:id/pricing from non-admin role', async () => {
    verifyAccessToken.mockResolvedValue({ role: 'TECHNICIAN', sub: 'tech-demo' });
    resolvePrincipal.mockImplementation(async (userId) => ({ id: userId, role: 'TECHNICIAN' }));

    const response = await request(app)
      .patch(`/orders/${orderId}/pricing`)
      .set('Authorization', 'Bearer test-session')
      .send({
        rates: { INSTALLATION: '850.00' },
      });

    expect(response.status).toBe(403);
    expect(mockOrderPricingService.updateOrderPricing).not.toHaveBeenCalled();
  });
});
