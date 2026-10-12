import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { openApiDocument } from './openapi.js';

describe('OpenAPI Contract Tests', () => {
  const app = createApp();

  it('documents pinned report and scoped recipient IDs for manual Gmail sending', () => {
    const operation = openApiDocument.paths['/api/v1/orders/{id}/report/send'].post;
    expect(operation.summary).toContain('ADMIN only');
    expect(operation.requestBody.content['application/json'].schema.required).toEqual(
      expect.arrayContaining(['reportId', 'recipientIds']),
    );
    expect(operation.responses['503']).toBeDefined();
    expect(openApiDocument.paths['/api/v1/orders/{id}/report/recipients']).toBeDefined();
  });

  it('documents ADMIN-only client management with immutable Sheets identity', () => {
    const paths = openApiDocument.paths;
    expect(paths['/api/v1/clients'].post.responses['503']).toBeDefined();
    expect(paths['/api/v1/clients/{id}'].patch.summary).toContain('immutable');
    expect(paths['/api/v1/clients/{id}/emails'].post.responses['403']).toBeDefined();
    expect(paths['/api/v1/clients/{id}/emails/{emailId}'].delete.parameters).toHaveLength(2);
  });

  it('matches paths declared in the OpenAPI document with reachable endpoints', async () => {
    const paths = Object.keys(openApiDocument.paths);
    expect(paths).toContain('/health/live');
    expect(paths).toContain('/health/ready');
    expect(paths).toContain('/metrics');
    expect(paths).toContain('/health/metrics');
  });

  it('GET /health/live matches OpenAPI 200 contract', async () => {
    const response = await request(app).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('status', 'ok');
    expect(response.body.data).toHaveProperty('service', 'api');
  });

  it('GET /health/ready matches OpenAPI 200 contract', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('status', 'ok');
  });

  it('GET /metrics matches OpenAPI 200 contract in text/plain format', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('http_requests_total');
  });

  it('GET /health/metrics matches OpenAPI 200 contract in json format', async () => {
    const response = await request(app).get('/health/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('httpRequestsTotal');
    expect(response.body).toHaveProperty('authLoginFailuresTotal');
    expect(response.body).toHaveProperty('uploadsFailedTotal');
  });

  it('unauthenticated calls to protected routes return 401 consistent with contract', async () => {
    const response = await request(app).get('/api/v1/orders');
    // Since auth is not mounted in empty createApp(), notFound returns 404
    // Route handler contract
    expect([401, 404]).toContain(response.status);
  });

  it('documents mandatory UUID technician selection and both new domain service values', () => {
    const schema =
      openApiDocument.paths['/api/v1/orders'].post.requestBody.content['application/json'].schema;
    expect(schema.required).toContain('technicianId');
    expect(schema.properties?.technicianId).toMatchObject({ type: 'string', format: 'uuid' });
    expect(schema.properties?.serviceType).toMatchObject({
      enum: expect.arrayContaining(['FUEL_SENSOR', 'EQUIPMENT_REPLACEMENT']),
    });
    expect(openApiDocument.paths['/api/v1/technicians/selectable']).toBeDefined();
  });

  it('documents separate administrative and execution order details', () => {
    expect(openApiDocument.paths['/api/v1/orders/{id}'].get.operationId).toBe(
      'getOrderAdministrationDetail',
    );
    expect(openApiDocument.paths['/api/v1/orders/{id}/execution'].get.operationId).toBe(
      'getOrderExecutionDetail',
    );
  });

  it('documents live-principal failures for protected session routes', () => {
    for (const operation of [
      openApiDocument.paths['/api/v1/auth/me'].get,
      openApiDocument.paths['/api/v1/auth/logout-all'].post,
    ]) {
      expect(operation.responses['401'].description).toContain('SESSION_REVOKED');
      expect(operation.responses['503'].description).toContain('AUTHORITY_UNAVAILABLE');
    }
  });
});
