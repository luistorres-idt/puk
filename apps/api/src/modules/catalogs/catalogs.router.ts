import { Router, type RequestHandler } from 'express';
import { CatalogSearchQuerySchema } from '@puk/contracts';
import { authorize } from '../../auth/authenticate.js';
import { assertIndividualTechnician } from '../../auth/order-access-policy.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../shared/errors.js';
import { sendSuccess } from '../../shared/http.js';
import type { CatalogServicePort } from '../../integrations/ports.js';

export function createCatalogsRouter(options: {
  catalogsService: CatalogServicePort;
  prisma?: PrismaClient;
  requireAccess: RequestHandler;
}): Router {
  const router = Router();
  router.use(options.requireAccess);

  router.get(
    '/clients',
    authorize('catalogs:read'),
    validate({ query: CatalogSearchQuerySchema }),
    async (request, response) => {
      await rejectSharedCatalogAccess(options.prisma, request.auth!);
      const search = typeof request.query.search === 'string' ? request.query.search : undefined;
      const { data, fetchedAt, sheetsAvailable } = await options.catalogsService.getClients(
        search !== undefined ? { search } : {},
      );
      sendSuccess(response, data, 200, {
        fetchedAt,
        total: data.length,
        ...(sheetsAvailable === undefined ? {} : { sheetsAvailable }),
      });
    },
  );

  router.get(
    '/equipment',
    authorize('catalogs:read'),
    validate({ query: CatalogSearchQuerySchema }),
    async (request, response) => {
      await rejectSharedCatalogAccess(options.prisma, request.auth!);
      const search = typeof request.query.search === 'string' ? request.query.search : undefined;
      const { data, fetchedAt, sheetsAvailable, registrationAllowed, warnings } =
        await options.catalogsService.getEquipment(search !== undefined ? { search } : {});
      sendSuccess(response, data, 200, {
        fetchedAt,
        total: data.length,
        ...(sheetsAvailable === undefined ? {} : { sheetsAvailable }),
        ...(registrationAllowed === undefined ? {} : { registrationAllowed }),
        ...(warnings === undefined ? {} : { warnings }),
      });
    },
  );

  router.get('/equipment/:externalKey', authorize('catalogs:read'), async (request, response) => {
    await rejectSharedCatalogAccess(options.prisma, request.auth!);
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
  });

  router.post('/refresh', authorize('orders:manage'), async (_request, response) => {
    options.catalogsService.invalidateCache();
    sendSuccess(response, { refreshed: true }, 200);
  });

  return router;
}

async function rejectSharedCatalogAccess(
  prisma: PrismaClient | undefined,
  auth: { role: 'ADMIN' | 'TECHNICIAN'; userId: string },
): Promise<void> {
  if (prisma === undefined) return;
  await assertIndividualTechnician(
    prisma,
    { id: auth.userId, role: auth.role },
    'La cuenta compartida no puede acceder a catálogos.',
  );
}
