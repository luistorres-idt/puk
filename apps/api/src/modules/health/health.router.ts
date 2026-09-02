import { Router } from 'express';

import { getLiveness } from './health.controller.js';

export const healthRouter: Router = Router();

healthRouter.get('/live', getLiveness);
