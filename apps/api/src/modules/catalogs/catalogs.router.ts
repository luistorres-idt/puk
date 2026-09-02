import { Router } from 'express';
import { CatalogSearchQuerySchema } from '@puk/contracts';
import { authenticate, authorize } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../shared/errors.js';
import { sendSuccess } from '../../shared/http.js';
import type { GoogleSheetsCatalogService } from '../../integrations/google-sheets/google-sheets.service.js';

export function createCatalogsRouter(options: {
  catalogsService: GoogleSheetsCatalogService;
  tokens: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(options.tokens));

  router.get(
    '/clients',
    authorize('catalogs:read'),
    validate({ query: CatalogSearchQuerySchema }),
    async (request, response) => {
      const search =
        typeof request.query.search === 'string' ? request.query.search : undefined;
      const { data, fetchedAt } = await options.catalogsService.getClients(
        search !== undefined ? { search } : {},
      );
      sendSuccess(response, data, 200, { fetchedAt, total: data.length });
    },
  );

  router.get(
    '/equipment',
    authorize('catalogs:read'),
    validate({ query: CatalogSearchQuerySchema }),
    async (request, response) => {
      const search =
        typeof request.query.search === 'string' ? request.query.search : undefined;
      const { data, fetchedAt } = await options.catalogsService.getEquipment(
        search !== undefined ? { search } : {},
      );
      sendSuccess(response, data, 200, { fetchedAt, total: data.length });
    },
  );

  router.get(
    '/equipment/:externalKey',
    authorize('catalogs:read'),
    async (request, response) => {
      const externalKey = String(request.params.externalKey);
      const forceFresh = request.query.fresh === 'true';
      const { equipment, fetchedAt } = await options.catalogsService.findEquipmentByKey(
        externalKey,
        forceFresh ? { forceFresh: true } : {},
      );

      if (!equipment) {
        throw new AppError(404, 'EQUIPMENT_NOT_FOUND', 'Equipo no encontrado');
      }

      sendSuccess(response, equipment, 200, { fetchedAt });
    },
  );

  router.post(
    '/refresh',
    authorize('orders:manage'),
    async (_request, response) => {
      options.catalogsService.invalidateCache();
      sendSuccess(response, { refreshed: true }, 200);
    },
  );

  return router;
}
