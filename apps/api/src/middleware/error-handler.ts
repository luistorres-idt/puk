import type { ErrorRequestHandler, RequestHandler } from 'express';

import { logger } from '../observability/logger.js';
import { AppError } from '../shared/errors.js';
import { responseMeta } from '../shared/http.js';

export const notFound: RequestHandler = (request, _response, next) => {
  next(
    new AppError(404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.path} was not found.`),
  );
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next;
  if (
    !(error instanceof AppError) &&
    error instanceof Error &&
    'type' in error &&
    'status' in error
  ) {
    if (error.type === 'entity.parse.failed' && error.status === 400) {
      error = new AppError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
    } else if (error.type === 'entity.too.large' && error.status === 413) {
      error = new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        'The request body exceeds the maximum allowed size.',
      );
    }
  }
  const knownError = error instanceof AppError ? error : undefined;
  const status = knownError?.status ?? 500;
  const code = knownError?.code ?? 'INTERNAL_ERROR';
  const message = knownError?.message ?? 'An unexpected error occurred.';

  logger.log(status >= 500 ? 'error' : 'warn', message, {
    code,
    error: error instanceof Error ? error : undefined,
    method: request.method,
    path: request.path,
    requestId: response.locals.requestId,
    status,
  });

  response.status(status).json({
    error: {
      code,
      ...(knownError?.details !== undefined ? { details: knownError.details } : {}),
      message,
    },
    meta: responseMeta(response),
  });
};
