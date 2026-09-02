import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from './docs/openapi.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { generalRateLimit } from './middleware/rate-limits.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRouter } from './modules/health/index.js';
import { httpLogger } from './observability/logger.js';

export interface AppOptions {
  allowedOrigins?: readonly string[];
  dependencyCheck?: () => Promise<boolean>;
  trustProxy?: boolean;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? ['http://localhost:5173'];

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? false);
  app.use(requestId);
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

  app.use('/health', createHealthRouter(options.dependencyCheck ?? (async () => true)));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
