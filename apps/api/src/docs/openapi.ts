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
                schema: {
                  additionalProperties: false,
                  properties: {
                    service: { const: 'api', type: 'string' },
                    status: { const: 'ok', type: 'string' },
                  },
                  required: ['service', 'status'],
                  type: 'object',
                },
              },
            },
            description: 'The API process is running.',
          },
        },
        summary: 'Check API liveness',
      },
    },
  },
} as const;
