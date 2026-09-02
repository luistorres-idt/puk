import { Router } from 'express';

import { getLiveness, readiness } from './health.controller.js';

export function createHealthRouter(dependencyCheck: () => Promise<boolean>): Router {
  const router = Router();

  router.get('/live', getLiveness);
  router.get('/ready', readiness(dependencyCheck));
  return router;
}
