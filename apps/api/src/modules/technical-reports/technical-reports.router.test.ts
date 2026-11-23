import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../auth/authenticate.js';
import type { Role } from '../../auth/capabilities.js';
import type { TokenService } from '../../auth/tokens.js';
import { errorHandler } from '../../middleware/error-handler.js';
import { createTechnicalReportsRouter } from './technical-reports.router.js';
import type { TechnicalReportsService } from './technical-reports.service.js';

const orderId = '00000000-0000-4000-8000-000000000010';
const userId = '00000000-0000-4000-8000-000000000001';

const service = {
  getReport: vi.fn(),
  updateOrderDhlShipping: vi.fn(),
  exportExcel: vi.fn(),
};

function makeApp(role: Role = 'BILLING') {
  const application = express();
  application.use(express.json());
  const tokens = {
    verifyAccessToken: vi.fn().mockResolvedValue({ sub: userId, role, type: 'access' }),
  } as unknown as TokenService;

  application.use(
    '/technical-reports',
    createTechnicalReportsRouter(
      service as unknown as TechnicalReportsService,
      authenticate(tokens, { resolve: async (id) => ({ id, role }) }),
    ),
  );
  application.use(errorHandler);
  return application;
}

describe('technical reports HTTP router & RBAC', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.getReport.mockResolvedValue({ window: {}, summary: {}, groups: [] });
    service.updateOrderDhlShipping.mockResolvedValue({ id: orderId, dhlShippingCost: 200 });
    service.exportExcel.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'Reporte.xlsx',
    });
  });

  it.each(['ADMIN', 'BILLING'] as const)(
    'allows %s to query, edit DHL, and export Excel',
    async (role) => {
      const app = makeApp(role);

      expect(
        (await request(app).get('/technical-reports?weekOffset=-1').set('Authorization', 'Bearer x'))
          .status,
      ).toBe(200);
      expect(service.getReport).toHaveBeenCalledWith({ weekOffset: -1 });

      expect(
        (
          await request(app)
            .patch(`/technical-reports/orders/${orderId}/dhl`)
            .set('Authorization', 'Bearer x')
            .send({ dhlShippingCost: 200 })
        ).status,
      ).toBe(200);

      const exportRes = await request(app)
        .get('/technical-reports/export')
        .set('Authorization', 'Bearer x');
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers['content-disposition']).toContain('Reporte.xlsx');
    },
  );

  it('rejects TECHNICIAN with 403 and unauthenticated with 401', async () => {
    expect(
      (await request(makeApp('TECHNICIAN')).get('/technical-reports').set('Authorization', 'Bearer x'))
        .status,
    ).toBe(403);
    expect((await request(makeApp('ADMIN')).get('/technical-reports')).status).toBe(401);
  });

  it('rejects negative DHL values with 400', async () => {
    const res = await request(makeApp('ADMIN'))
      .patch(`/technical-reports/orders/${orderId}/dhl`)
      .set('Authorization', 'Bearer x')
      .send({ dhlShippingCost: -5 });
    expect(res.status).toBe(400);
    expect(service.updateOrderDhlShipping).not.toHaveBeenCalled();
  });
});
