import { Router, type RequestHandler } from 'express';
import { RegisterEquipmentSchema } from '@puk/contracts';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { InventoryService } from './inventory.service.js';

export function createInventoryRouter(
  service: InventoryService,
  requireAccess: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAccess);
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
