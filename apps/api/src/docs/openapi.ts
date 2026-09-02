import { toJsonSchema } from '@valibot/to-json-schema';
import {
  HealthResponseSchema,
  LoginRequestSchema,
  CreateOrderSchema,
  CreateTechnicianSchema,
} from '@puk/contracts';

const schemaConfig = { errorMode: 'ignore' as const };
const standardHealthResponse = toJsonSchema(HealthResponseSchema, schemaConfig);
const loginRequestSchema = toJsonSchema(LoginRequestSchema, schemaConfig);
const createOrderSchema = toJsonSchema(CreateOrderSchema, schemaConfig);
const createTechnicianSchema = toJsonSchema(CreateTechnicianSchema, schemaConfig);

export const openApiDocument = {
  info: {
    title: 'Service Orders API — Bull Dog Solution',
    description: 'API for vehicular service order management, execution and Google Sheets sync',
    version: '0.1.0',
  },
  jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
  openapi: '3.1.0',
  paths: {
    '/health/live': {
      get: {
        operationId: 'getLiveness',
        summary: 'Check API liveness',
        responses: {
          '200': {
            description: 'The API process is running.',
            content: { 'application/json': { schema: standardHealthResponse } },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        operationId: 'getReadiness',
        summary: 'Check API readiness',
        responses: {
          '200': {
            description: 'All required dependencies are available.',
            content: { 'application/json': { schema: standardHealthResponse } },
          },
          '503': {
            description: 'At least one required dependency is unavailable.',
            content: { 'application/json': { schema: standardHealthResponse } },
          },
        },
      },
    },
    '/metrics': {
      get: {
        operationId: 'getMetricsPrometheus',
        summary: 'Prometheus metrics exposition',
        responses: {
          '200': {
            description: 'Plain text Prometheus metrics',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/health/metrics': {
      get: {
        operationId: 'getMetricsJson',
        summary: 'JSON snapshot of application metrics',
        responses: {
          '200': {
            description: 'JSON metrics snapshot',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        operationId: 'login',
        summary: 'User and technician authentication',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: loginRequestSchema } },
        },
        responses: {
          '200': {
            description: 'Session authenticated, returns user and sets refresh cookie',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        operationId: 'refresh',
        summary: 'Refresh access token with rotating refresh cookie',
        responses: {
          '200': { description: 'New access token emitted' },
          '401': { description: 'Invalid or revoked refresh token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        operationId: 'logout',
        summary: 'Revoke active refresh token and clear cookie',
        responses: {
          '200': { description: 'Logged out successfully' },
        },
      },
    },
    '/api/v1/technicians': {
      get: {
        operationId: 'listTechnicians',
        summary: 'Directory of technicians',
        responses: {
          '200': { description: 'List of registered technicians' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
      post: {
        operationId: 'createTechnician',
        summary: 'Register new technician',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: createTechnicianSchema } },
        },
        responses: {
          '201': { description: 'Technician created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/api/v1/orders': {
      get: {
        operationId: 'listOrders',
        summary: 'Paginated list of service orders',
        responses: {
          '200': { description: 'List of orders with pagination metadata' },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        operationId: 'createOrder',
        summary: 'Create draft service order',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: createOrderSchema } },
        },
        responses: {
          '201': { description: 'Draft order created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
  },
} as const;
