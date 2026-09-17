import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from './docs/openapi.js';
import { authenticate } from './auth/authenticate.js';
import { PrismaPrincipalResolver } from './auth/principal-resolver.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { generalRateLimit } from './middleware/rate-limits.js';
import { requestId } from './middleware/request-id.js';
import { createAuthRouter, type AuthRouterOptions } from './modules/auth/index.js';
import { createHealthRouter } from './modules/health/index.js';
import {
  createAdministrationRouter,
  type AdministrationRouterOptions,
} from './modules/administration/index.js';
import { createCatalogsRouter } from './modules/catalogs/index.js';
import {
  createOrdersRouter,
  type OrdersService,
  type SyncService,
} from './modules/orders/index.js';
import { createExecutionRouter, type ExecutionService } from './modules/execution/index.js';
import { createReportsRouter, type ReportsService } from './modules/reports/index.js';
import {
  createSharedTechnicianAccessRouter,
  type SharedTechnicianAccessService,
} from './modules/shared-technician-access/index.js';
import type { CatalogServicePort } from './integrations/ports.js';
import { httpLogger } from './observability/logger.js';
import { metrics, metricsMiddleware } from './observability/metrics.js';

export interface AppOptions {
  administration?: Omit<AdministrationRouterOptions, 'requireAccess'>;
  allowedOrigins?: readonly string[];
  auth?: Omit<AuthRouterOptions, 'requireAccess'> & { minimumPasswordLength: number };
  catalogsService?: CatalogServicePort;
  ordersService?: OrdersService;
  syncService?: SyncService;
  executionService?: ExecutionService;
  reportsService?: ReportsService;
  sharedTechnicianAccessService?: SharedTechnicianAccessService;
  dependencyCheck?: () => Promise<boolean>;
  trustProxy?: boolean;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? ['http://localhost:5173'];

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? false);
  app.use(requestId);
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, origin === undefined || allowedOrigins.includes(origin));
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(httpLogger);
  app.use(generalRateLimit);

  app.get('/metrics', async (_request, response) => {
    response.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    const body = await metrics.toPrometheusFormat(options.auth?.prisma);
    response.send(body);
  });

  app.get('/health/metrics', async (_request, response) => {
    const snapshot = await metrics.getSnapshot(options.auth?.prisma);
    response.json(snapshot);
  });

  app.use('/health', createHealthRouter(options.dependencyCheck ?? (async () => true)));
  if (options.auth !== undefined) {
    const principalResolver =
      options.auth.principalResolver ?? new PrismaPrincipalResolver(options.auth.prisma);
    const requireAccess = authenticate(options.auth.tokens, principalResolver);

    app.use('/api/v1/auth', createAuthRouter({ ...options.auth, requireAccess }));
    app.use(
      '/api/v1',
      createAdministrationRouter({
        ...(options.administration ?? options.auth),
        requireAccess,
      }),
    );
    if (options.sharedTechnicianAccessService !== undefined) {
      app.use(
        '/api/v1',
        createSharedTechnicianAccessRouter({
          service: options.sharedTechnicianAccessService,
          requireAccess,
        }),
      );
    }
    if (options.catalogsService !== undefined) {
      app.use(
        '/api/v1/external',
        createCatalogsRouter({
          catalogsService: options.catalogsService,
          prisma: options.auth.prisma,
          requireAccess,
        }),
      );
    }
    if (options.ordersService !== undefined) {
      app.use(
        '/api/v1/orders',
        createOrdersRouter({
          ordersService: options.ordersService,
          requireAccess,
          ...(options.syncService !== undefined ? { syncService: options.syncService } : {}),
        }),
      );
    }
    if (options.executionService !== undefined) {
      app.use(
        '/api/v1',
        createExecutionRouter({
          executionService: options.executionService,
          requireAccess,
        }),
      );
    }
    if (options.reportsService !== undefined) {
      app.use(
        '/api/v1/orders',
        createReportsRouter({
          reportsService: options.reportsService,
          requireAccess,
        }),
      );
    }
  }
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
