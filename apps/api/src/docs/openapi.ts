import { toJsonSchema } from '@valibot/to-json-schema';
import { HealthResponseSchema } from '@puk/contracts';

const standardHealthResponse = toJsonSchema(HealthResponseSchema);

export const openApiDocument = {
  info: {
    title: 'Service Orders API',
    version: '0.1.0',
  },
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  openapi: '3.1.0',
  paths: {
    '/health/live': {
      get: {
        operationId: 'getLiveness',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: standardHealthResponse,
              },
            },
            description: 'The API process is running.',
          },
        },
        summary: 'Check API liveness',
      },
    },
    '/health/ready': {
      get: {
        operationId: 'getReadiness',
        responses: {
          '200': {
            content: { 'application/json': { schema: standardHealthResponse } },
            description: 'All required dependencies are available.',
          },
          '503': {
            content: { 'application/json': { schema: standardHealthResponse } },
            description: 'At least one required dependency is unavailable.',
          },
        },
        summary: 'Check API readiness',
      },
    },
  },
} as const;
