import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from './config.js';
import { TestHttpClient, assertStatus, assertContentType } from './client.js';

/**
 * TIER 1: FEATURE COVERAGE
 *
 * Verifies the primary happy path and core feature availability over CloudFront:
 * 1. Web Service Root (SPA HTML delivery)
 * 2. API Liveness Check (/health/live)
 * 3. API Readiness Check (/health/ready)
 * 4. Prometheus Metrics Exposition (/metrics)
 * 5. Swagger / OpenAPI Documentation (/docs/)
 * 6. API Route Contract (/api/v1/auth/me unauthenticated contract)
 *
 * Authoritative Sources:
 * - docs/technical/infrastructure-and-operations.md
 * - docs/technical/api.md
 */

const config = resolveConfig();
const client = new TestHttpClient(config.cloudfrontUrl);

test('Tier 1 - Feature Coverage', async (t) => {
  await t.test('T1.1: Web Service Root returns 200 OK with HTML over CloudFront', async () => {
    const res = await client.get('/');
    assertStatus(res, 200, 'Web root availability');
    assertContentType(res, /text\/html/, 'Web root content type');
    assert.ok(
      res.body.includes('<div id="app"') ||
        res.body.includes('Bull Dog Solution') ||
        res.body.includes('<!DOCTYPE html>'),
      'Response body should contain HTML structure for the web SPA',
    );
  });

  await t.test(
    'T1.2: API Liveness Probe (/health/live) returns 200 OK with JSON status',
    async () => {
      const res = await client.get('/health/live');
      assertStatus(res, 200, 'Health liveness check');
      assertContentType(res, /application\/json/, 'Liveness JSON content type');

      const json = res.json<{ data?: { status: string; service?: string }; status?: string }>();
      const status = json.data?.status ?? json.status;
      assert.equal(status, 'ok', 'Liveness payload must report status "ok"');
    },
  );

  await t.test(
    'T1.3: API Readiness Probe (/health/ready) returns 200 OK with JSON status',
    async () => {
      const res = await client.get('/health/ready');
      assertStatus(res, 200, 'Health readiness check');
      assertContentType(res, /application\/json/, 'Readiness JSON content type');

      const json = res.json<{ data?: { status: string; service?: string }; status?: string }>();
      const status = json.data?.status ?? json.status;
      assert.equal(status, 'ok', 'Readiness payload must report status "ok"');
    },
  );

  await t.test(
    'T1.4: Prometheus Metrics Exposition (/metrics) returns 200 OK in text format',
    async () => {
      const res = await client.get('/metrics');
      assertStatus(res, 200, 'Metrics availability');
      assertContentType(res, /text\/plain/, 'Prometheus metrics content type');
      assert.ok(
        res.body.includes('# HELP') ||
          res.body.includes('# TYPE') ||
          res.body.includes('process_cpu') ||
          res.body.includes('http_request'),
        'Metrics response body should contain Prometheus format comments or metric lines',
      );
    },
  );

  await t.test('T1.5: OpenAPI Documentation (/docs/) returns 200 OK with Swagger UI', async () => {
    const res = await client.get('/docs/');
    assertStatus(res, [200, 301, 308], 'Swagger UI docs availability');
    if (res.status === 200) {
      assertContentType(res, /text\/html/, 'Docs HTML content type');
      assert.ok(
        res.body.includes('swagger') ||
          res.body.includes('openapi') ||
          res.body.includes('Swagger UI'),
        'Docs body should contain Swagger UI elements',
      );
    }
  });

  await t.test(
    'T1.6: API Subsystem Contract (/api/v1/auth/me) routes to API container and rejects unauthenticated request',
    async () => {
      const res = await client.get('/api/v1/auth/me');
      assertStatus(res, 401, 'Unauthenticated API access');
      assertContentType(res, /application\/json/, 'API error JSON content type');

      const json = res.json<{ error?: { code?: string; message?: string } }>();
      assert.ok(json.error !== undefined, 'API response must contain structured error object');
      assert.ok(
        json.error.code === 'UNAUTHORIZED' ||
          json.error.code === 'AUTH_REQUIRED' ||
          json.error.code === 'UNAUTHENTICATED',
        `Error code should indicate unauthorized access, got ${json.error.code}`,
      );
    },
  );
});
