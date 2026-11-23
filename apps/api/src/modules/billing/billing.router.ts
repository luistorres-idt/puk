import {
  ClientEmailParamsSchema,
  CreateInvoiceSchema,
  IdParamsSchema,
  InvoiceListQuerySchema,
  InvoicePaymentParamsSchema,
  RecordInvoicePaymentSchema,
  SaveClientEmailSchema,
  UpdateBillingClientAccountSchema,
  UpdateInvoiceSchema,
  type InvoiceListQuery,
} from '@puk/contracts';
import { Router, type RequestHandler } from 'express';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { BillingService } from './billing.service.js';

export function createBillingRouter(
  service: BillingService,
  requireAccess: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAccess, authorize('billing:manage'));

  router.get(
    '/invoices',
    validate({ query: InvoiceListQuerySchema }),
    async (request, response) =>
      sendSuccess(response, await service.listInvoices(request.query as InvoiceListQuery)),
  );

  router.get(
    '/invoices/:id',
    validate({ params: IdParamsSchema }),
    async (request, response) =>
      sendSuccess(response, await service.getInvoice(String(request.params.id))),
  );

  router.post(
    '/invoices',
    validate({ body: CreateInvoiceSchema }),
    async (request, response) =>
      sendSuccess(response, await service.createInvoice(request.auth!.userId, request.body), 201),
  );

  router.patch(
    '/invoices/:id',
    validate({ params: IdParamsSchema, body: UpdateInvoiceSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.updateInvoice(request.auth!.userId, String(request.params.id), request.body),
      ),
  );

  router.delete(
    '/invoices/:id',
    validate({ params: IdParamsSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.deleteInvoice(request.auth!.userId, String(request.params.id)),
      ),
  );

  router.post(
    '/invoices/:id/payments',
    validate({ params: IdParamsSchema, body: RecordInvoicePaymentSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.recordPayment(request.auth!.userId, String(request.params.id), request.body),
        201,
      ),
  );

  router.delete(
    '/invoices/:id/payments/:paymentId',
    validate({ params: InvoicePaymentParamsSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.deletePayment(
          request.auth!.userId,
          String(request.params.id),
          String(request.params.paymentId),
        ),
      ),
  );

  router.get('/clients', async (_request, response) =>
    sendSuccess(response, await service.listClientAccounts()),
  );

  router.patch(
    '/clients/:id',
    validate({ params: IdParamsSchema, body: UpdateBillingClientAccountSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.updateClientAccount(
          request.auth!.userId,
          String(request.params.id),
          request.body,
        ),
      ),
  );

  router.post(
    '/clients/:id/emails',
    validate({ params: IdParamsSchema, body: SaveClientEmailSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.addClientEmail(request.auth!.userId, String(request.params.id), request.body),
        201,
      ),
  );

  router.delete(
    '/clients/:id/emails/:emailId',
    validate({ params: ClientEmailParamsSchema }),
    async (request, response) =>
      sendSuccess(
        response,
        await service.removeClientEmail(
          request.auth!.userId,
          String(request.params.id),
          String(request.params.emailId),
        ),
      ),
  );

  return router;
}
