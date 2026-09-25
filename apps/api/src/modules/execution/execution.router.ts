import { Router, raw, type RequestHandler } from 'express';
import * as v from 'valibot';
import {
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
  UpdateExecutionNotesSchema,
  UnitParamsSchema,
} from '@puk/contracts';
import { authorize } from '../../auth/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../shared/http.js';
import { AppError } from '../../shared/errors.js';
import type { ExecutionService } from './execution.service.js';

function binaryParser(limit: number): RequestHandler {
  const parse = raw({ type: () => true, limit });
  return (request, response, next) => {
    parse(request, response, (error?: unknown) => {
      if (error && (error as { type?: string }).type === 'entity.too.large') {
        next(new AppError(413, 'FILE_TOO_LARGE', 'El archivo excede el tamaño máximo permitido'));
      } else {
        next(error);
      }
    });
  };
}

function binaryBody(body: unknown): Uint8Array {
  if (!Buffer.isBuffer(body)) {
    throw new AppError(415, 'INVALID_BINARY_BODY', 'Se requiere un archivo binario');
  }
  return body;
}

function dimensionHeader(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 100_000) {
    throw new AppError(400, 'INVALID_IMAGE_DIMENSION', `${field} debe ser un entero positivo`);
  }
  return Number(value);
}

export function createExecutionRouter(options: {
  executionService: ExecutionService;
  requireAccess: RequestHandler;
}): Router {
  const router = Router();
  router.use(options.requireAccess);

  router.get('/storage/mode', (_request, response) => {
    sendSuccess(response, { provider: options.executionService.getStorageMode() });
  });

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
    '/orders/:id/units/:unitId/evidence/file',
    binaryParser(options.executionService.getEvidenceUploadLimit()),
    async (request, response) => {
      const result = await options.executionService.uploadEvidenceFile(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        String(request.params.unitId),
        binaryBody(request.body),
        request.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() ?? '',
        {
          width: dimensionHeader(request.header('X-Image-Width'), 'X-Image-Width'),
          height: dimensionHeader(request.header('X-Image-Height'), 'X-Image-Height'),
        },
        v.parse(v.pipe(v.string(), v.uuid()), request.header('Idempotency-Key') ?? ''),
      );
      sendSuccess(response, result, 201);
    },
  );

  router.post(
    '/orders/:id/units/:unitId/evidence/presign',
    validate({ body: PresignEvidenceSchema }),
    async (request, response) => {
      const result = await options.executionService.presignEvidenceUpload(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        String(request.params.unitId),
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
    '/evidence/:id/file',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const file = await options.executionService.getEvidenceFile(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Cache-Control', 'private, no-store');
      response.send(Buffer.from(file.body));
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
  router.put(
    '/orders/:id/signature/file',
    binaryParser(options.executionService.getSignatureUploadLimit()),
    async (request, response) => {
      const mimeType = request.header('Content-Type')?.split(';')[0]?.trim().toLowerCase();
      if (mimeType !== 'image/png') {
        throw new AppError(415, 'UNSUPPORTED_IMAGE_TYPE', 'La firma debe ser PNG');
      }
      const result = await options.executionService.uploadSignatureFile(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        binaryBody(request.body),
        request.header('X-Signer-Name') ?? '',
        v.parse(v.pipe(v.string(), v.uuid()), request.header('Idempotency-Key') ?? ''),
      );
      sendSuccess(response, result);
    },
  );

  router.get(
    '/orders/:id/signature/file',
    validate({ params: IdParamsSchema }),
    async (request, response) => {
      const file = await options.executionService.getSignatureFile(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
      );
      response.setHeader('Content-Type', file.mimeType);
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('X-Signer-Name', encodeURIComponent(file.signerName));
      response.send(Buffer.from(file.body));
    },
  );

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
      const result = await options.executionService.validateCompleteness(String(request.params.id));
      sendSuccess(response, result);
    },
  );

  router.patch(
    '/orders/:id/execution-notes',
    validate({ body: UpdateExecutionNotesSchema, params: IdParamsSchema }),
    async (request, response) => {
      const result = await options.executionService.updateExecutionNotes(
        request.auth!.userId,
        request.auth!.role as 'ADMIN' | 'TECHNICIAN',
        String(request.params.id),
        request.body,
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
