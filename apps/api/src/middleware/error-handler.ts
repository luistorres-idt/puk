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
  const knownError = error instanceof AppError;
  const status = knownError ? error.status : 500;
  const code = knownError ? error.code : 'INTERNAL_ERROR';
  const message = knownError ? error.message : 'An unexpected error occurred.';

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
      ...(knownError && error.details !== undefined ? { details: error.details } : {}),
      message,
    },
    meta: responseMeta(response),
  });
};
