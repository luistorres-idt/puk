import { Router } from 'express';
import * as v from 'valibot';
import {
  ChecklistCategorySchema,
  CompleteEvidenceSchema,
  CompleteSignatureSchema,
  EquipmentParamsSchema,
  FailAppointmentSchema,
  IdParamsSchema,
  PresignEvidenceSchema,
  PresignSignatureSchema,
  ReportDiscrepancySchema,
  RequireCorrectionSchema,
  SaveChecklistSchema,
  UnitParamsSchema,
} from '@puk/contracts';
import { authenticate, authorize } from '../../auth/authenticate.js';
import type { TokenService } from '../../auth/tokens.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import type { ExecutionService } from './execution.service.js';

export function createExecutionRouter(options: {
  executionService: ExecutionService;
  tokens: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(options.tokens));

  // --- Start order ---
  router.post(
    '/orders/:id/start',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const updated = await options.executionService.startOrder(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      sendSuccess(response, updated);
    },
  );

  // --- Equipment verification ---
  router.post(
    '/orders/:id/units/:unitId/equipment/:equipmentId/verify',
    validate({ params: EquipmentParamsSchema }),
    async (request, response) => {
      const updated = await options.executionService.verifyEquipment(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        String(request.params.unitId),
        String(request.params.equipmentId),
      );
      sendSuccess(response, updated);
    },
  );

  // --- Discrepancy reporting ---
  router.post(
    '/orders/:id/units/:unitId/equipment/:equipmentId/discrepancy',
    validate({ body: ReportDiscrepancySchema, params: EquipmentParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.reportDiscrepancy(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        String(request.params.unitId),
        String(request.params.equipmentId),
        request.body,
      );
      sendSuccess(response, result, 201);
    },
  );

  // --- Checklist ---
  router.put(
    '/orders/:id/units/:unitId/checklist',
    validate({ body: SaveChecklistSchema, params: UnitParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.saveChecklist(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        String(request.params.unitId),
        request.body.items,
      );
      sendSuccess(response, result);
    },
  );

  // --- Evidence presign and complete ---
  router.post(
    '/orders/:id/units/:unitId/checklist/:category/evidence/presign',
    validate({ body: PresignEvidenceSchema }),
    async (request, response) => {
      const rawCategory = typeof request.params.category === 'string' ? request.params.category : request.params.category?.[0];
      const category = v.parse(
        ChecklistCategorySchema,
        rawCategory?.toUpperCase(),
      );
      const result = await options.executionService.presignEvidenceUpload(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        String(request.params.unitId),
        category,
        request.body,
      );
      sendSuccess(response, result, 201);
    },
  );

  router.post(
    '/evidence/:id/complete',
    validate({ body: CompleteEvidenceSchema, params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.completeEvidence(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, result);
    },
  );

  router.delete(
    '/evidence/:id',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.deleteEvidence(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      sendSuccess(response, result);
    },
  );

  router.get(
    '/evidence/:id/url',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.getEvidenceUrl(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      sendSuccess(response, result);
    },
  );

  // --- Signatures ---
  router.post(
    '/orders/:id/signature/presign',
    validate({ body: PresignSignatureSchema, params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.presignSignatureUpload(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, result, 201);
    },
  );

  router.post(
    '/orders/:id/signature/complete',
    validate({ body: CompleteSignatureSchema, params: IdParamsSchema }),
    async (request, response) => {
      const objectKey = String(request.query.objectKey || '');
      const result = await options.executionService.completeSignature(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        request.body,
        objectKey,
      );
      sendSuccess(response, result);
    },
  );

  router.get(
    '/orders/:id/signature/url',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.getSignatureUrl(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      sendSuccess(response, result);
    },
  );

  // --- Order closure, failed appointment, corrections ---
  router.get(
    '/orders/:id/completeness',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.validateCompleteness(
        String(request.params.id),
      );
      sendSuccess(response, result);
    },
  );

  router.post(
    '/orders/:id/complete',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.completeOrder(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      sendSuccess(response, result);
    },
  );

  router.post(
    '/orders/:id/fail-appointment',
    validate({ body: FailAppointmentSchema, params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.failAppointment(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, result);
    },
  );

  router.post(
    '/orders/:id/require-correction',
    authorize('orders:manage'),
    validate({ body: RequireCorrectionSchema, params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.requireCorrection(
        request.auth!.userId,
        String(request.params.id),
        request.body,
      );
      sendSuccess(response, result);
    },
  );

  return router;
}
