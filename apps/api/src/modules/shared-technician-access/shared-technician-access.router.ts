import {
  UpdateSharedTechnicianAccessAccountSchema,
  UpdateSharedTechnicianAccessOrderSchema,
} from '@puk/contracts';
import { Router } from 'express';

import { authenticate, authorize } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { SharedTechnicianAccessService } from './shared-technician-access.service.js';

export function createSharedTechnicianAccessRouter(options: {
  service: SharedTechnicianAccessService;
  tokens: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(options.tokens));

  router.get('/shared-technician-access', authorize('users:manage'), async (_request, response) => {
    sendSuccess(response, await options.service.getConfig());
  });

  router.put(
    '/shared-technician-access/account',
    authorize('users:manage'),
    validate({ body: UpdateSharedTechnicianAccessAccountSchema }),
    async (request, response) => {
      sendSuccess(
        response,
        await options.service.updateAccount(request.auth!.userId, request.body),
      );
    },
  );

  router.put(
    '/shared-technician-access/order',
    authorize('orders:manage'),
    validate({ body: UpdateSharedTechnicianAccessOrderSchema }),
    async (request, response) => {
      sendSuccess(response, await options.service.updateOrder(request.auth!.userId, request.body));
    },
  );

  router.get('/me/order-access', async (request, response) => {
    sendSuccess(response, await options.service.getMeOrderAccess(request.auth!.userId));
  });

  return router;
}
