import type { RequestHandler } from 'express';

import { sendSuccess } from '../../shared/http.js';

export const getLiveness: RequestHandler = (_request, response) => {
  sendSuccess(response, {
    service: 'api',
    status: 'ok',
  });
};

export function readiness(dependencyCheck: () => Promise<boolean>): RequestHandler {
  return async (_request, response) => {
    const ready = await dependencyCheck();
    sendSuccess(response, { service: 'api', status: ready ? 'ok' : 'degraded' }, ready ? 200 : 503);
  };
}
