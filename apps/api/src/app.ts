import express, { type Express } from 'express';

import { healthRouter } from './modules/health/index.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use('/health', healthRouter);

  return app;
}
