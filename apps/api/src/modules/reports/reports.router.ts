import { Router, type Request, type RequestHandler, type Response } from 'express';
import { IdParamsSchema, SendReportEmailSchema } from '@puk/contracts';
import * as v from 'valibot';

import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { AppError } from '../../shared/errors.js';
import type { ReportsService } from './reports.service.js';
import type { ReportEmailService } from './report-email.service.js';

export function createReportsRouter(options: {
  reportsService: ReportsService;
  reportEmailService?: ReportEmailService;
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

  router.get(
    '/:id/report/recipients',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      if (!options.reportEmailService)
        throw new AppError(
          503,
          'REPORT_EMAIL_UNAVAILABLE',
          'El envío por Gmail no está configurado.',
        );
      sendSuccess(
        response,
        await options.reportEmailService.recipients(String(request.params.id), request.auth!),
      );
    },
  );
  router.post(
    '/:id/report/send',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema, body: SendReportEmailSchema }),
    async (request, response) => {
      if (!options.reportEmailService)
        throw new AppError(
          503,
          'REPORT_EMAIL_UNAVAILABLE',
          'El envío por Gmail no está configurado.',
        );
      sendSuccess(
        response,
        await options.reportEmailService.send(
          String(request.params.id),
          request.auth!,
          request.body,
        ),
      );
    },
  );

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



  return router;
}
