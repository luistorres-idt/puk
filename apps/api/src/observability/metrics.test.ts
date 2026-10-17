import { describe, expect, it, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MetricsService, metricsMiddleware } from './metrics.js';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = MetricsService.getInstance();
    metrics.reset();
  });

  it('records http requests and latencies with normalized paths', async () => {
    metrics.recordHttpRequest(
      'GET',
      '/api/v1/orders/123e4567-e89b-12d3-a456-426614174000',
      200,
      150,
    );
    metrics.recordHttpRequest(
      'GET',
      '/api/v1/orders/987e6543-e89b-12d3-a456-426614174999',
      200,
      250,
    );

    const snapshot = await metrics.getSnapshot();
    expect(snapshot.httpRequestsTotal['GET:/api/v1/orders/:id:200']).toBe(2);
    expect(snapshot.httpRequestDurationSeconds['GET:/api/v1/orders/:id']).toBe(0.2);
  });

  it('records auth login failures and upload failures', async () => {
    metrics.recordAuthFailure();
    metrics.recordAuthFailure();
    metrics.recordUploadFailure();

    const snapshot = await metrics.getSnapshot();
    expect(snapshot.authLoginFailuresTotal).toBe(2);
    expect(snapshot.uploadsFailedTotal).toBe(1);
  });

  it('records sheets sync operations and circuit breaker states', async () => {
    metrics.recordSheetsOperation('COMPLETED');
    metrics.recordSheetsOperation('FAILED');
    metrics.recordCircuitBreakerState('google-sheets', 'CLOSED');

    const snapshot = await metrics.getSnapshot();
    expect(snapshot.sheetsOperationsTotal['COMPLETED']).toBe(1);
    expect(snapshot.sheetsOperationsTotal['FAILED']).toBe(1);
    expect(snapshot.circuitBreakerState['google-sheets']).toBe('CLOSED');
  });

  it('formats metrics in valid Prometheus plain text format', async () => {
    metrics.recordHttpRequest('POST', '/api/v1/auth/login', 401, 50);
    metrics.recordAuthFailure();

    const prom = await metrics.toPrometheusFormat();
    expect(prom).toContain(
      'http_requests_total{method="POST",path="/api/v1/auth/login",status="401"} 1',
    );
    expect(prom).toContain('auth_login_failures_total 1');
    expect(prom).toContain('# HELP');
  });

  it('preserves route parameters in Prometheus path labels', async () => {
    metrics.recordHttpRequest('GET', '/api/v1/orders/123e4567-e89b-12d3-a456-426614174000', 200, 5);

    const prom = await metrics.toPrometheusFormat();
    expect(prom).toContain('method="GET",path="/api/v1/orders/:id",status="200"');
    expect(prom).toContain('method="GET",path="/api/v1/orders/:id"}');
    expect(prom).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('records matched route templates and never records raw unmatched paths', async () => {
    const app = express();
    app.use(metricsMiddleware);
    app.get('/orders/:id', (_request, response) => response.sendStatus(200));
    app.use((_request, response) => response.sendStatus(404));

    await request(app).get('/orders/customer-private-slug').expect(200);
    await request(app).get('/unknown/customer-private-slug').expect(404);

    const snapshot = await metrics.getSnapshot();
    expect(snapshot.httpRequestsTotal['GET:/orders/:id:200']).toBe(1);
    expect(snapshot.httpRequestsTotal['GET:/unmatched:404']).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain('customer-private-slug');
  });
});
