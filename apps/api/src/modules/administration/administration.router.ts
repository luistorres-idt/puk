import {
  CreateTechnicianSchema,
  CreateUserSchema,
  IdParamsSchema,
  UpdateTechnicianSchema,
  UpdateUserSchema,
} from '@puk/contracts';
import { Router } from 'express';

import { authenticate, authorize } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { TechniciansService } from '../technicians/index.js';
import { UsersService } from '../users/index.js';

export interface AdministrationRouterOptions {
  minimumPasswordLength?: number;
  prisma?: PrismaClient;
  tokens: TokenService;
  usersService?: UsersService;
  techniciansService?: TechniciansService;
}

export function createAdministrationRouter(options: AdministrationRouterOptions): Router {
  const router = Router();
  const users =
    options.usersService ?? new UsersService(options.prisma!, options.minimumPasswordLength ?? 12);
  const technicians = options.techniciansService ?? new TechniciansService(options.prisma!);

  router.use(authenticate(options.tokens));

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
  router.get('/technicians/selectable', authorize('orders:manage'), async (_request, response) =>
    sendSuccess(response, await technicians.listSelectable()),
  );
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

  return router;
}
