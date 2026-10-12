import { Router, type RequestHandler } from 'express';
import {
  ClientEmailParamsSchema,
  CreateClientSchema,
  IdParamsSchema,
  SaveClientEmailSchema,
  UpdateClientSchema,
} from '@puk/contracts';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { ClientsService } from './clients.service.js';

export function createClientsRouter(
  service: ClientsService,
  requireAccess: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAccess, authorize('clients:manage'));
  router.get('/', async (_request, response) => sendSuccess(response, await service.list()));
  router.get('/:id', validate({ params: IdParamsSchema }), async (request, response) =>
    sendSuccess(response, await service.get(String(request.params.id))),
  );
  router.post('/', validate({ body: CreateClientSchema }), async (request, response) =>
    sendSuccess(response, await service.create(request.auth!.userId, request.body), 201),
  );
  router.patch(
    '/:id',
    validate({ params: IdParamsSchema, body: UpdateClientSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.update(request.auth!.userId, String(request.params.id), request.body),
      ),
  );
  router.post(
    '/:id/emails',
    validate({ params: IdParamsSchema, body: SaveClientEmailSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.addEmail(request.auth!.userId, String(request.params.id), request.body),
        201,
      ),
  );
  router.patch(
    '/:id/emails/:emailId',
    validate({ params: ClientEmailParamsSchema, body: SaveClientEmailSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.updateEmail(
          request.auth!.userId,
          String(request.params.id),
          String(request.params.emailId),
          request.body,
        ),
      ),
  );
  router.delete(
    '/:id/emails/:emailId',
    validate({ params: ClientEmailParamsSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.removeEmail(
          request.auth!.userId,
          String(request.params.id),
          String(request.params.emailId),
        ),
      ),
  );
  return router;
}
