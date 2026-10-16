import { Router, type RequestHandler } from 'express';
import * as v from 'valibot';
import {
  AssignEquipmentSchema,
  CancelOrderSchema,
  CreateOrderSchema,
  CreateUnitSchema,
  EquipmentParamsSchema,
  IdParamsSchema,
  OrderListQuerySchema,
  OrderPricingOverridesSchema,
  RescheduleFailedAppointmentSchema,
  UnitParamsSchema,
  UpdateOrderSchema,
  UpdateUnitSchema,
  type OrderListQuery,
} from '@puk/contracts';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { AppError } from '../../shared/errors.js';
import type { OrdersService } from './orders.service.js';
import type { OrderPricingService } from './order-pricing.service.js';
import type { SyncService } from './sync.service.js';

export function createOrdersRouter(options: {
  ordersService: OrdersService;
  requireAccess: RequestHandler;
  syncService?: SyncService;
  orderPricingService?: OrderPricingService;
}): Router {
  const router = Router();
  router.use(options.requireAccess);
  const readIdempotencyKey = (value: string | undefined): string => {
    const result = v.safeParse(v.pipe(v.string(), v.uuid()), value);
    if (!result.success) {
      throw new AppError(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'A valid UUID Idempotency-Key is required.',
      );
    }
    return result.output;
  };

  // --- Orders CRUD ---

  router.get('/', validate({ query: OrderListQuerySchema }), async (request, response) => {
    const actor = {
      id: request.auth!.userId,
      role: request.auth!.role as 'ADMIN' | 'TECHNICIAN',
    };
    const result = await options.ordersService.listOrders(
      actor,
      request.query as unknown as OrderListQuery,
    );
    sendSuccess(response, result.data, 200, { pagination: result.pagination });
  });

  router.post(
    '/',
    authorize('orders:manage'),
    (request, _response, next) => {
      try {
        readIdempotencyKey(request.header('Idempotency-Key'));
        next();
      } catch (error) {
        next(error);
      }
    },
    validate({ body: CreateOrderSchema }),
    async (request, response) => {
      const order = await options.ordersService.createOrder(
        request.auth!.userId,
        request.body,
        readIdempotencyKey(request.header('Idempotency-Key')),
      );
      sendSuccess(response, order, 201);
    },
  );

  router.get('/:id/execution', validate({ params: IdParamsSchema }), async (request, response) => {
    const actor = {
      id: request.auth!.userId,
      role: request.auth!.role as 'ADMIN' | 'TECHNICIAN',
    };
    const order = await options.ordersService.getOrderExecutionById(
      String(request.params.id),
      actor,
    );
    sendSuccess(response, order);
  });

  router.get(
    '/:id',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const actor = {
        id: request.auth!.userId,
        role: request.auth!.role as 'ADMIN' | 'TECHNICIAN',
      };
      const order = await options.ordersService.getOrderById(String(request.params.id), actor);
      sendSuccess(response, order);
    },
  );

  router.patch(
    '/:id',
    authorize('orders:manage'),
    validate({ body: UpdateOrderSchema, params: IdParamsSchema }),
    async (request, response) => {
      const updated = await options.ordersService.updateOrder(
        request.auth!.userId,
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, updated);
    },
  );

  router.patch(
    '/:id/pricing',
    authorize('orders:manage'),
    validate({ body: OrderPricingOverridesSchema, params: IdParamsSchema }),
    async (request, response) => {
      if (!options.orderPricingService) {
        throw new AppError(500, 'PRICING_SERVICE_UNAVAILABLE', 'Servicio de tarifas no disponible');
      }
      const updated = await options.orderPricingService.updateOrderPricing(
        request.auth!.userId,
        String(request.params.id),
        request.body,
      );
      if (options.syncService) {
        options.syncService.processPendingOperations().catch(() => {});
      }
      sendSuccess(response, updated);
    },
  );

  router.post(
    '/:id/assign',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const updated = await options.ordersService.assignAndSyncOrder(
        request.auth!.userId,
        String(request.params.id),
      );
      // Process pending sync operations immediately in background or synchronously
      if (options.syncService) {
        options.syncService.processPendingOperations().catch(() => {});
      }
      sendSuccess(response, updated);
    },
  );

  router.post(
    '/:id/cancel',
    authorize('orders:manage'),
    validate({ body: CancelOrderSchema, params: IdParamsSchema }),
    async (request, response) => {
      const updated = await options.ordersService.cancelOrder(
        request.auth!.userId,
        String(request.params.id),
        request.body.reason,
      );
      sendSuccess(response, updated);
    },
  );

  router.post(
    '/:id/reschedule',
    authorize('orders:manage'),
    validate({ body: RescheduleFailedAppointmentSchema, params: IdParamsSchema }),
    async (request, response) => {
      const created = await options.ordersService.rescheduleFailedAppointment(
        request.auth!.userId,
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, created, 201);
    },
  );

  router.get(
    '/:id/audit',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const logs = await options.ordersService.getOrderAuditLogs(String(request.params.id));
      sendSuccess(response, logs);
    },
  );

  // --- Units ---

  router.post(
    '/:id/units',
    authorize('orders:manage'),
    validate({ body: CreateUnitSchema, params: IdParamsSchema }),
    async (request, response) => {
      const unit = await options.ordersService.addUnit(
        request.auth!.userId,
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, unit, 201);
    },
  );

  router.patch(
    '/:id/units/:unitId',
    authorize('orders:manage'),
    validate({ body: UpdateUnitSchema, params: UnitParamsSchema }),
    async (request, response) => {
      const updated = await options.ordersService.updateUnit(
        request.auth!.userId,
        String(request.params.id),
        String(request.params.unitId),
        request.body,
      );
      sendSuccess(response, updated);
    },
  );

  router.delete(
    '/:id/units/:unitId',
    authorize('orders:manage'),
    validate({ params: UnitParamsSchema }),
    async (request, response) => {
      await options.ordersService.deleteUnit(
        request.auth!.userId,
        String(request.params.id),
        String(request.params.unitId),
      );
      sendSuccess(response, { deleted: true });
    },
  );

  // --- Equipment ---

  router.post(
    '/:id/units/:unitId/equipment',
    authorize('orders:manage'),
    validate({ body: AssignEquipmentSchema, params: UnitParamsSchema }),
    async (request, response) => {
      const eq = await options.ordersService.assignEquipment(
        request.auth!.userId,
        String(request.params.id),
        String(request.params.unitId),
        request.body,
      );
      sendSuccess(response, eq, 201);
    },
  );

  router.delete(
    '/:id/units/:unitId/equipment/:equipmentId',
    authorize('orders:manage'),
    validate({ params: EquipmentParamsSchema }),
    async (request, response) => {
      await options.ordersService.removeEquipment(
        request.auth!.userId,
        String(request.params.id),
        String(request.params.unitId),
        String(request.params.equipmentId),
      );
      sendSuccess(response, { removed: true });
    },
  );

  // --- Sync Operations ---

  router.get(
    '/:id/sync',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      if (!options.syncService) {
        sendSuccess(response, { isFullySynced: true, operations: [] });
        return;
      }
      const syncStatus = await options.syncService.getOrderSyncStatus(String(request.params.id));
      sendSuccess(response, syncStatus);
    },
  );

  router.post(
    '/:id/sync/retry',
    authorize('orders:manage'),
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      if (!options.syncService) {
        sendSuccess(response, { retriedCount: 0 });
        return;
      }
      const result = await options.syncService.retryFailedOperations(String(request.params.id));
      // Process retried operations
      options.syncService.processPendingOperations().catch(() => {});
      sendSuccess(response, result);
    },
  );

  return router;
}
