import { Router, type Request, type RequestHandler, type Response } from 'express';
import { IdParamsSchema } from '@puk/contracts';
import * as v from 'valibot';

import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { AppError } from '../../shared/errors.js';
import type { ReportsService } from './reports.service.js';

export function createReportsRouter(options: {
  reportsService: ReportsService;
  requireAccess: RequestHandler;
}): Router {
  const router = Router();
  router.use(options.requireAccess);

  async function sendDriveReport(request: Request, response: Response, version?: number) {
    const file = await options.reportsService.getDownloadFile(
      String(request.params.id),
      request.auth!.userId,
      request.auth!.role as 'ADMIN' | 'TECHNICIAN',
      version,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(Buffer.from(file.bytes));
  }

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
    '/:id/reports/:version/file',
    validate({
      params: v.object({
        id: v.pipe(v.string(), v.uuid()),
        version: v.pipe(v.string(), v.regex(/^[1-9]\d*$/)),
      }),
    }),
    async (request, response) => {
      const version = Number(request.params.version);
      if (!Number.isSafeInteger(version) || version < 1) {
        throw new AppError(400, 'INVALID_REPORT_VERSION', 'Versión de reporte inválida');
      }
      await sendDriveReport(request, response, version);
    },
  );

  router.get(
    '/:id/report/file',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      await sendDriveReport(request, response);
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
