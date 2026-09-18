import { toJsonSchema } from '@valibot/to-json-schema';
import {
  HealthResponseSchema,
  LoginRequestSchema,
  CreateOrderSchema,
  CreateTechnicianSchema,
  TechnicianOptionSchema,
  OrderServiceTypeSchema,
  OrderAdministrationDetailSchema,
  OrderExecutionDetailSchema,
  AssignEquipmentSchema,
  CreateUnitSchema,
  UpdateOrderSchema,
  MeOrderAccessResponseSchema,
  SharedTechnicianAccessConfigSchema,
  UpdateSharedTechnicianAccessAccountSchema,
  UpdateSharedTechnicianAccessOrderSchema,
} from '@puk/contracts';

const schemaConfig = { errorMode: 'ignore' as const };
const standardHealthResponse = toJsonSchema(HealthResponseSchema, schemaConfig);
const loginRequestSchema = toJsonSchema(LoginRequestSchema, schemaConfig);
const createOrderSchema = toJsonSchema(CreateOrderSchema, schemaConfig);
const createTechnicianSchema = toJsonSchema(CreateTechnicianSchema, schemaConfig);
const technicianOptionSchema = toJsonSchema(TechnicianOptionSchema, schemaConfig);
const sharedTechnicianAccessConfigSchema = toJsonSchema(
  SharedTechnicianAccessConfigSchema,
  schemaConfig,
);
const updateSharedTechnicianAccessAccountSchema = toJsonSchema(
  UpdateSharedTechnicianAccessAccountSchema,
  schemaConfig,
);
const updateSharedTechnicianAccessOrderSchema = toJsonSchema(
  UpdateSharedTechnicianAccessOrderSchema,
  schemaConfig,
);
const meOrderAccessResponseSchema = toJsonSchema(MeOrderAccessResponseSchema, schemaConfig);
const orderAdministrationDetailSchema = toJsonSchema(OrderAdministrationDetailSchema, schemaConfig);
const orderExecutionDetailSchema = toJsonSchema(OrderExecutionDetailSchema, schemaConfig);
const orderIdParameter = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

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
    '/api/v1/auth/logout-all': {
      post: {
        operationId: 'logoutAll',
        summary: 'Revoke every refresh session for the current active principal',
        responses: {
          '200': { description: 'All refresh sessions revoked' },
          '401': { description: 'Invalid token or SESSION_REVOKED' },
          '503': { description: 'AUTHORITY_UNAVAILABLE while resolving current authorization' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        operationId: 'getCurrentSessionUser',
        summary: 'Get the current active user using live authorization state',
        responses: {
          '200': { description: 'Current session user' },
          '401': { description: 'Invalid token or SESSION_REVOKED' },
          '503': { description: 'AUTHORITY_UNAVAILABLE while resolving current authorization' },
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
    '/api/v1/technicians/selectable': {
      get: {
        operationId: 'listSelectableTechnicians',
        summary: 'Active technicians for order creation without contact or billing data',
        responses: {
          '200': {
            description: 'Selectable local technicians',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { type: 'array', items: technicianOptionSchema } },
                  required: ['data'],
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/api/v1/orders': {
      get: {
        operationId: 'listOrders',
        summary: 'Paginated list of service orders',
        parameters: [
          {
            in: 'query',
            name: 'serviceType',
            required: false,
            schema: toJsonSchema(OrderServiceTypeSchema, schemaConfig),
          },
        ],
        responses: {
          '200': { description: 'List of orders with pagination metadata' },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        operationId: 'createOrder',
        summary: 'Create draft service order with a required active technician',
        description:
          'Initial units and equipment are provided in this request. Later additions are allowed only for installation drafts. FUEL_SENSOR and EQUIPMENT_REPLACEMENT are recognized domain values whose creation is unavailable until their workflows are defined.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: createOrderSchema } },
        },
        responses: {
          '201': { description: 'Draft order created with the selected technician' },
          '400': {
            description: 'Validation error, inactive technician, or unavailable service workflow',
          },
          '404': { description: 'Selected technician does not exist' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/api/v1/orders/{id}': {
      get: {
        operationId: 'getOrderAdministrationDetail',
        summary: 'Get the explicit administrative order detail',
        parameters: [orderIdParameter],
        responses: {
          '200': {
            description: 'Administrative order detail',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: orderAdministrationDetailSchema },
                  required: ['data'],
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Administrator permission required' },
          '404': { description: 'Order not found' },
        },
      },
      patch: {
        operationId: 'updateOrder',
        summary: 'Update an editable order; technician selection cannot be cleared',
        parameters: [orderIdParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: toJsonSchema(UpdateOrderSchema, schemaConfig) },
          },
        },
        responses: {
          '200': { description: 'Order updated' },
          '400': {
            description:
              'Validation error, invalid state, inactive technician, or unavailable service workflow',
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Order or technician not found' },
          '409': { description: 'Order version conflict' },
        },
      },
    },
    '/api/v1/orders/{id}/execution': {
      get: {
        operationId: 'getOrderExecutionDetail',
        summary: 'Get the least-privilege order detail required for service execution',
        parameters: [orderIdParameter],
        responses: {
          '200': {
            description: 'Execution order detail without administrative or billing data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: orderExecutionDetailSchema },
                  required: ['data'],
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Order is not accessible to the current technician' },
          '404': { description: 'Order not found' },
        },
      },
    },
    '/api/v1/orders/{id}/units': {
      post: {
        operationId: 'addOrderUnit',
        summary: 'Add a unit to an INSTALLATION draft after creation',
        parameters: [orderIdParameter],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: toJsonSchema(CreateUnitSchema, schemaConfig) } },
        },
        responses: {
          '201': { description: 'Unit added' },
          '400': {
            description: 'Validation error, INVALID_ORDER_STATE, or ORDER_ADDITIONS_NOT_ALLOWED',
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Order not found' },
          '409': { description: 'Duplicate unit serial number' },
        },
      },
    },
    '/api/v1/orders/{id}/units/{unitId}/equipment': {
      post: {
        operationId: 'addOrderEquipment',
        summary: 'Add equipment to an INSTALLATION draft after creation',
        parameters: [
          orderIdParameter,
          {
            in: 'path',
            name: 'unitId',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: toJsonSchema(AssignEquipmentSchema, schemaConfig) },
          },
        },
        responses: {
          '201': { description: 'Equipment added' },
          '400': {
            description: 'Validation error, INVALID_ORDER_STATE, or ORDER_ADDITIONS_NOT_ALLOWED',
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' },
          '404': { description: 'Order or unit not found' },
          '409': { description: 'Equipment already assigned' },
        },
      },
    },
    '/api/v1/orders/{id}/report': {
      get: {
        operationId: 'getCurrentServiceOrderReport',
        summary: 'Get current service order PDF status',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Current report metadata or null' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Order does not belong to the technician' },
        },
      },
    },
    '/api/v1/orders/{id}/reports': {
      get: {
        operationId: 'listServiceOrderReports',
        summary: 'List generated report versions',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Versioned reports' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Order does not belong to the technician' },
        },
      },
    },
    '/api/v1/orders/{id}/report/generate': {
      post: {
        operationId: 'generateServiceOrderReport',
        summary: 'Generate or retry the service order PDF',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '202': { description: 'Report generation requested' },
          '400': { description: 'Order is not completed' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Administrator permission required' },
        },
      },
    },
    '/api/v1/orders/{id}/report/download': {
      get: {
        operationId: 'downloadServiceOrderReport',
        summary: 'Get a temporary private PDF download URL',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Temporary download URL and file name' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Order does not belong to the technician' },
          '409': { description: 'Report is not ready' },
        },
      },
    },
    '/api/v1/shared-technician-access': {
      get: {
        operationId: 'getSharedTechnicianAccess',
        summary: 'Get shared technician access configuration',
        responses: {
          '200': {
            description: 'Shared technician access configuration',
            content: { 'application/json': { schema: sharedTechnicianAccessConfigSchema } },
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden - requires users:manage' },
        },
      },
    },
    '/api/v1/shared-technician-access/account': {
      put: {
        operationId: 'updateSharedTechnicianAccessAccount',
        summary: 'Designate or clear shared technician account',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: updateSharedTechnicianAccessAccountSchema } },
        },
        responses: {
          '200': {
            description: 'Updated shared technician access configuration',
            content: { 'application/json': { schema: sharedTechnicianAccessConfigSchema } },
          },
          '400': { description: 'Validation error or invalid technician account' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden - requires users:manage' },
          '409': { description: 'Order access revision conflict' },
        },
      },
    },
    '/api/v1/shared-technician-access/order': {
      put: {
        operationId: 'updateSharedTechnicianAccessOrder',
        summary: 'Enable or revoke order for shared technician access',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: updateSharedTechnicianAccessOrderSchema } },
        },
        responses: {
          '200': {
            description: 'Updated shared technician access configuration',
            content: { 'application/json': { schema: sharedTechnicianAccessConfigSchema } },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden - requires orders:manage' },
          '404': { description: 'Order not found' },
          '409': { description: 'Order access revision conflict or order not eligible' },
        },
      },
    },
    '/api/v1/me/order-access': {
      get: {
        operationId: 'getMeOrderAccess',
        summary: 'Get current user order access mode and active shared order context',
        responses: {
          '200': {
            description: 'Current order access context',
            content: { 'application/json': { schema: meOrderAccessResponseSchema } },
          },
          '401': { description: 'Unauthorized' },
        },
      },
    },
  },
} as const;
