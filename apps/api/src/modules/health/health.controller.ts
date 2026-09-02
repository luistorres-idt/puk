import type { HealthResponse } from '@puk/contracts';
import type { RequestHandler } from 'express';

export const getLiveness: RequestHandler = (_request, response) => {
  const health: HealthResponse = {
    service: 'api',
    status: 'ok',
  };

  response.status(200).json(health);
};
