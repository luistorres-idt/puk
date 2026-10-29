import { Router, type RequestHandler } from 'express';
import {
  RegisterEquipmentSchema,
  IdParamsSchema,
  UpdateInventoryEquipmentSchema,
  DeleteInventoryEquipmentSchema,
} from '@puk/contracts';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { InventoryService } from './inventory.service.js';

/**
 * Builds the Express router for `/api/v1/inventory`, exposing administrative endpoints
 * to list, register, edit (`PATCH`), and archive (`DELETE`) local equipment records.
 */
export function createInventoryRouter(
  service: InventoryService,
  requireAccess: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAccess);
  router.get('/equipment', authorize('orders:manage'), async (request, response) => {
    sendSuccess(
      response,
      await service.list({ id: request.auth!.userId, role: request.auth!.role }),
    );
  });
  router.patch(
    '/equipment/:id',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema, body: UpdateInventoryEquipmentSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.update(
          { id: request.auth!.userId, role: request.auth!.role },
          String(request.params.id),
          request.body,
        ),
      ),
  );
  router.delete(
    '/equipment/:id',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema, body: DeleteInventoryEquipmentSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.remove(
          { id: request.auth!.userId, role: request.auth!.role },
          String(request.params.id),
          request.body,
        ),
      ),
  );
  router.post(
    '/equipment',
    authorize('orders:manage'),
    validate({ body: RegisterEquipmentSchema }),
    async (request, response) => {
      const equipment = await service.register(
        { id: request.auth!.userId, role: request.auth!.role },
        request.body,
      );
      sendSuccess(response, equipment, 201);
    },
  );
  return router;
}
