import {
  IdParamsSchema,
  TechnicalReportExportQuerySchema,
  TechnicalReportQuerySchema,
  UpdateOrderDhlShippingSchema,
  type TechnicalReportExportQuery,
  type TechnicalReportQuery,
} from '@puk/contracts';
import { Router, type RequestHandler } from 'express';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { TechnicalReportsService } from './technical-reports.service.js';

export function createTechnicalReportsRouter(
  service: TechnicalReportsService,
  requireAccess: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAccess, authorize('technical-reports:manage'));

  router.get(
    '/',
    validate({ query: TechnicalReportQuerySchema }),
    async (request, response) =>
      sendSuccess(response, await service.getReport(request.query as TechnicalReportQuery)),
  );

  router.patch(
    '/orders/:id/dhl',
    validate({ params: IdParamsSchema, body: UpdateOrderDhlShippingSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.updateOrderDhlShipping(
          request.auth!.userId,
          String(request.params.id),
          request.body,
        ),
      ),
  );

  router.get(
    '/export',
    validate({ query: TechnicalReportExportQuerySchema }),
    async (request, response) => {
      const { bytes, fileName } = await service.exportExcel(
        request.query as TechnicalReportExportQuery,
      );
      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      response.status(200).send(Buffer.from(bytes));
    },
  );

  return router;
}
