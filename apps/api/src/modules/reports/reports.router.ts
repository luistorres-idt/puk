import { Router, type RequestHandler } from 'express';
import { IdParamsSchema } from '@puk/contracts';

import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { ReportsService } from './reports.service.js';

export function createReportsRouter(options: {
  reportsService: ReportsService;
  requireAccess: RequestHandler;
}): Router {
  const router = Router();
  router.use(options.requireAccess);

  router.get('/:id/report', validate({ params: IdParamsSchema }), async (request, response) => {
    const report = await options.reportsService.getCurrent(
      String(request.params.id),
      request.auth!.userId,
      request.auth!.role as 'ADMIN' | 'TECHNICIAN',
    );
    sendSuccess(response, report);
  });

  router.get('/:id/reports', validate({ params: IdParamsSchema }), async (request, response) => {
    const reports = await options.reportsService.listVersions(
      String(request.params.id),
      request.auth!.userId,
      request.auth!.role as 'ADMIN' | 'TECHNICIAN',
    );
    sendSuccess(response, reports);
  });

  router.post(
    '/:id/report/generate',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      await options.reportsService.requestGeneration(
        String(request.params.id),
        request.auth!.userId,
      );
      options.reportsService.processPendingReports(1).catch(() => {});
      const report = await options.reportsService.getCurrent(
        String(request.params.id),
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
      );
      sendSuccess(response, report, 202);
    },
  );

  router.get(
    '/:id/report/download',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const download = await options.reportsService.getDownloadUrl(
        String(request.params.id),
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
      );
      sendSuccess(response, download);
    },
  );

  return router;
}
