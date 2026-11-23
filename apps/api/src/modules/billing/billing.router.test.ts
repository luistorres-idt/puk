import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../auth/authenticate.js';
import type { Role } from '../../auth/capabilities.js';
import type { TokenService } from '../../auth/tokens.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { createBillingRouter } from './billing.router.js';
import type { BillingService } from './billing.service.js';

const clientId = '00000000-0000-4000-8000-000000000001';
const invoiceId = '00000000-0000-4000-8000-000000000010';
const paymentId = '00000000-0000-4000-8000-000000000020';
const emailId = '00000000-0000-4000-8000-000000000030';

const service = {
  listInvoices: vi.fn(),
  getInvoice: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  recordPayment: vi.fn(),
  deletePayment: vi.fn(),
  listClientAccounts: vi.fn(),
  updateClientAccount: vi.fn(),
  addClientEmail: vi.fn(),
  removeClientEmail: vi.fn(),
};

function makeApp(role: Role = 'BILLING') {
  const application = express();
  application.use(express.json());
  const tokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: clientId, role, type: 'access' }),
  } as unknown as TokenService;

  application.use(
    '/billing',
    createBillingRouter(
      service as unknown as BillingService,
      authenticate(tokens, { resolve: async (userId) => ({ id: userId, role }) }),
    ),
  );
  application.use(errorHandler);
  return application;
}

describe('billing HTTP router & RBAC', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const mock of Object.values(service)) {
      mock.mockResolvedValue({ ok: true });
    }
  });

  it.each(['ADMIN', 'BILLING'] as const)('allows %s to access billing endpoints', async (role) => {
    const app = makeApp(role);

    expect((await request(app).get('/billing/invoices').set('Authorization', 'Bearer x')).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .post('/billing/invoices')
          .set('Authorization', 'Bearer x')
          .send({
            folio: 'FAC-1',
            clientId,
            totalAmount: 1200,
            issuedAt: '2026-11-01T00:00:00.000Z',
          })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .post(`/billing/invoices/${invoiceId}/payments`)
          .set('Authorization', 'Bearer x')
          .send({
            amount: 500,
            paidAt: '2026-11-10T00:00:00.000Z',
          })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .delete(`/billing/invoices/${invoiceId}/payments/${paymentId}`)
          .set('Authorization', 'Bearer x')
      ).status,
    ).toBe(200);
    expect((await request(app).get('/billing/clients').set('Authorization', 'Bearer x')).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .patch(`/billing/clients/${clientId}`)
          .set('Authorization', 'Bearer x')
          .send({
            accountStatus: 'PAYMENT_PROMISE',
            paymentPromiseDate: '2026-11-30T00:00:00.000Z',
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post(`/billing/clients/${clientId}/emails`)
          .set('Authorization', 'Bearer x')
          .send({ email: 'cobranza@example.com' })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .delete(`/billing/clients/${clientId}/emails/${emailId}`)
          .set('Authorization', 'Bearer x')
      ).status,
    ).toBe(200);
  });

  it('rejects TECHNICIAN on all billing routes with 403', async () => {
    const app = makeApp('TECHNICIAN');
    const response = await request(app)
      .get('/billing/invoices')
      .set('Authorization', 'Bearer x');
    expect(response.status).toBe(403);
    expect(service.listInvoices).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = makeApp('BILLING');
    const response = await request(app).get('/billing/invoices');
    expect(response.status).toBe(401);
  });

  it('rejects PAYMENT_PROMISE without paymentPromiseDate with 400', async () => {
    const app = makeApp('BILLING');
    const response = await request(app)
      .patch(`/billing/clients/${clientId}`)
      .set('Authorization', 'Bearer x')
      .send({ accountStatus: 'PAYMENT_PROMISE' });
    expect(response.status).toBe(400);
    expect(service.updateClientAccount).not.toHaveBeenCalled();
  });
});
