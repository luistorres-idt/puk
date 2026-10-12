import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { createReportsRouter } from './reports.router.js';
import type { ReportsService } from './reports.service.js';
import type { ReportEmailService } from './report-email.service.js';
const id = '00000000-0000-4000-8000-000000000001';
const reportId = '00000000-0000-4000-8000-000000000002';
const recipientId = '00000000-0000-4000-8000-000000000003';
const email = { recipients: vi.fn(), send: vi.fn() };
function app(role: 'ADMIN' | 'TECHNICIAN' = 'ADMIN', enabled = true) {
  const app = express();
  app.use(express.json());
  const tokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: id, role }),
  } as unknown as TokenService;
  app.use(
    '/orders',
    createReportsRouter({
      reportsService: {} as ReportsService,
      ...(enabled ? { reportEmailService: email as unknown as ReportEmailService } : {}),
      requireAccess: authenticate(tokens, { resolve: async (userId) => ({ id: userId, role }) }),
    }),
  );
  app.use(errorHandler);
  return app;
}
describe('manual report email HTTP authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    email.recipients.mockResolvedValue({ client: null, configured: false });
    email.send.mockResolvedValue({ status: 'SUCCESS' });
  });
  it('passes explicit report/recipient IDs and the current administrator', async () => {
    const response = await request(app())
      .post(`/orders/${id}/report/send`)
      .set('Authorization', 'Bearer test')
      .send({ reportId, recipientIds: [recipientId] });
    expect(response.status).toBe(200);
    expect(email.send).toHaveBeenCalledWith(
      id,
      { userId: id, role: 'ADMIN' },
      { reportId, recipientIds: [recipientId] },
    );
    expect(
      (
        await request(app())
          .get(`/orders/${id}/report/recipients`)
          .set('Authorization', 'Bearer test')
      ).status,
    ).toBe(200);
  });
  it.each(['get', 'post'] as const)(
    'rejects unauthenticated and TECHNICIAN %s before service calls',
    async (method) => {
      const path = `/orders/${id}/report/${method === 'get' ? 'recipients' : 'send'}`;
      expect((await request(app())[method](path).send({})).status).toBe(401);
      expect(
        (
          await request(app('TECHNICIAN'))
            [method](path)
            .set('Authorization', 'Bearer test')
            .send({})
        ).status,
      ).toBe(403);
      expect(email.send).not.toHaveBeenCalled();
      expect(email.recipients).not.toHaveBeenCalled();
    },
  );
  it('rejects invalid payloads and reports unavailable sender wiring', async () => {
    expect(
      (
        await request(app())
          .post(`/orders/${id}/report/send`)
          .set('Authorization', 'Bearer test')
          .send({ reportId, recipientIds: [] })
      ).status,
    ).toBe(400);
    expect(email.send).not.toHaveBeenCalled();
    expect(
      (
        await request(app('ADMIN', false))
          .post(`/orders/${id}/report/send`)
          .set('Authorization', 'Bearer test')
          .send({ reportId, recipientIds: [recipientId] })
      ).status,
    ).toBe(503);
  });
});
