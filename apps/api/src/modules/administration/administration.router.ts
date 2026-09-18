import {
  CreateTechnicianSchema,
  CreateUserSchema,
  IdParamsSchema,
  SyncOperationsQuerySchema,
  UpdateTechnicalReportSyncScheduleSchema,
  UpdateTechnicianSchema,
  UpdateUserSchema,
} from '@puk/contracts';
import { Router, type RequestHandler } from 'express';

import { authorize } from '../../auth/authenticate.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { TechniciansService } from '../technicians/index.js';
import { UsersService } from '../users/index.js';
import type { SyncService, TechnicalReportSyncScheduleService } from '../orders/index.js';

export interface AdministrationRouterOptions {
  minimumPasswordLength?: number;
  prisma?: PrismaClient;
  requireAccess: RequestHandler;
  usersService?: UsersService;
  techniciansService?: TechniciansService;
  syncService?: SyncService;
  technicalReportSyncSchedule?: TechnicalReportSyncScheduleService;
}

export function createAdministrationRouter(options: AdministrationRouterOptions): Router {
  const router = Router();
  const users =
    options.usersService ?? new UsersService(options.prisma!, options.minimumPasswordLength ?? 12);
  const technicians = options.techniciansService ?? new TechniciansService(options.prisma!);

  router.use(options.requireAccess);

  router.get('/users', authorize('users:manage'), async (_request, response) =>
    sendSuccess(response, await users.list()),
  );
  router.post(
    '/users',
    authorize('users:manage'),
    validate({ body: CreateUserSchema }),
    async (request, response) => {
      sendSuccess(response, await users.create(request.auth!.userId, request.body), 201);
    },
  );
  router.patch(
    '/users/:id',
    authorize('users:manage'),
    validate({ body: UpdateUserSchema, params: IdParamsSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await users.update(request.auth!.userId, String(request.params.id), request.body),
      ),
  );

  router.get('/technicians', authorize('technicians:manage'), async (_request, response) =>
    sendSuccess(response, await technicians.list()),
  );
  router.get('/technicians/selectable', authorize('orders:manage'), async (request, response) => {
    const forceFresh = request.query.fresh === 'true';
    const data = await technicians.listSelectable({ forceSync: forceFresh });
    const lastSync = technicians.getLastSyncAt();
    sendSuccess(response, data, 200, {
      fetchedAt: lastSync ? new Date(lastSync).toISOString() : null,
      total: data.length,
    });
  });
  router.post('/technicians/sync', authorize('technicians:manage'), async (request, response) =>
    sendSuccess(response, await technicians.syncFromSheets(request.auth!.userId)),
  );
  router.post(
    '/technicians',
    authorize('technicians:manage'),
    validate({ body: CreateTechnicianSchema }),
    async (request, response) =>
      sendSuccess(response, await technicians.create(request.auth!.userId, request.body), 201),
  );
  router.patch(
    '/technicians/:id',
    authorize('technicians:manage'),
    validate({ body: UpdateTechnicianSchema, params: IdParamsSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await technicians.update(request.auth!.userId, String(request.params.id), request.body),
      ),
  );

  if (options.syncService && options.technicalReportSyncSchedule) {
    router.get(
      '/sync',
      authorize('sync:retry'),
      validate({ query: SyncOperationsQuerySchema }),
      async (request, response) =>
        sendSuccess(response, await options.syncService!.listOperations(request.query)),
    );
    router.get('/sync/schedule', authorize('sync:retry'), async (_request, response) =>
      sendSuccess(response, await options.technicalReportSyncSchedule!.getConfig()),
    );
    router.put(
      '/sync/schedule',
      authorize('sync:retry'),
      validate({ body: UpdateTechnicalReportSyncScheduleSchema }),
      async (request, response) =>
        sendSuccess(
          response,
          await options.technicalReportSyncSchedule!.updateConfig(
            request.auth!.userId,
            request.body,
          ),
        ),
    );
    router.post(
      '/sync/:id/retry',
      authorize('sync:retry'),
      validate({ params: IdParamsSchema }),
      async (request, response) => {
        const operation = await options.syncService!.retryOperation(String(request.params.id));
        options.syncService!.processPendingOperations().catch(() => {});
        sendSuccess(response, operation);
      },
    );
  }

  return router;
}
