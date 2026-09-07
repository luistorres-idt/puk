import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from './config.js';
import { TestHttpClient, assertStatus, assertContentType, assertHeaderMatches } from './client.js';

/**
 * TIER 2: BOUNDARY & CORNER CASES
 *
 * Verifies edge conditions, routing boundaries, and security enforcement:
 * 1. Direct ALB bypass blocking (403 Forbidden without valid X-Origin-Verify)
 * 2. Direct ALB bypass with tampered header (403 Forbidden)
 * 3. Direct ALB access with valid header (200 OK)
 * 4. HTTP to HTTPS Viewer Protocol Redirection
 * 5. Non-trailing slash ALB routing (/docs -> routes to API, not SPA HTML)
 * 6. Non-trailing slash API routing (/api, /health -> routes to API)
 * 7. Nonexistent API route 404 integrity (JSON 404, not SPA fallback)
 * 8. Nonexistent static asset 404 integrity (/assets/* -> 404, not SPA fallback)
 * 9. SPA client-side deep routing (/orders/view/123 -> 200 index.html)
 * 10. CORS preflight OPTIONS request
 *
 * Authoritative Sources:
 * - docs/technical/infrastructure-and-operations.md
 * - infra/cdk/lib/application-stack.ts
 */

const config = resolveConfig();
const cfClient = new TestHttpClient(config.cloudfrontUrl);
const albClient = new TestHttpClient(config.albUrl);

test('Tier 2 - Boundary & Corner Cases', async (t) => {
  await t.test(
    'T2.1: Direct ALB access without secret header returns 403 Forbidden (Feature 7 & 18)',
    async () => {
      // Attempt direct access to load balancer bypassing CloudFront
      const res = await albClient.get('/');
      assertStatus(res, 403, 'Direct ALB access rejection');
    },
  );

  await t.test(
    'T2.2: Direct ALB access with forged/invalid X-Origin-Verify header returns 403 Forbidden',
    async () => {
      const res = await albClient.get('/', {
        headers: {
          'x-origin-verify': 'malicious-forged-token-xyz-123',
        },
      });
      assertStatus(res, 403, 'Forged header rejection');
    },
  );

  await t.test(
    'T2.3: Direct ALB access with valid X-Origin-Verify header succeeds (200 OK)',
    async () => {
      const res = await albClient.get('/', {
        headers: {
          'x-origin-verify': config.originVerifySecret,
        },
      });
      assertStatus(res, 200, 'Authorized origin access');
    },
  );

  await t.test(
    'T2.4: HTTP to HTTPS viewer protocol redirection enforces transport security',
    async () => {
      const httpClient = new TestHttpClient(config.cloudfrontHttpUrl);
      const res = await httpClient.get('/', { redirect: 'manual' });
      assertStatus(res, [301, 302, 307, 308], 'HTTP to HTTPS redirect');
      assertHeaderMatches(res, 'location', /^https:\/\//i, 'Redirect target protocol');
    },
  );

  await t.test(
    'T2.5: Non-trailing slash routing for /docs routes to API container (Feature 9)',
    async () => {
      // Should NOT route to SPA index.html
      const res = await cfClient.get('/docs', { redirect: 'manual' });
      assertStatus(res, [200, 301, 302, 307, 308], 'Non-trailing slash /docs routing');

      if (res.status === 200) {
        assert.ok(
          res.body.includes('swagger') ||
            res.body.includes('openapi') ||
            res.body.includes('Swagger UI'),
          'Must be Swagger UI, not SPA index.html',
        );
      } else {
        const location = res.headers['location'];
        assert.ok(
          location !== undefined && location.includes('/docs'),
          `Redirect location should route to /docs/, got ${location}`,
        );
      }
    },
  );

  await t.test(
    'T2.6: Non-trailing slash /api and /health routes do NOT fall through to SPA HTML',
    async () => {
      const resHealth = await cfClient.get('/health');
      assert.ok(
        !resHealth.body.includes('<div id="app">'),
        'Request to /health must not serve SPA index.html fallback',
      );

      const resApi = await cfClient.get('/api');
      assert.ok(
        !resApi.body.includes('<div id="app">'),
        'Request to /api must not serve SPA index.html fallback',
      );
    },
  );

  await t.test(
    'T2.7: Nonexistent API path returns JSON 404, never SPA HTML (Route Isolation)',
    async () => {
      const res = await cfClient.get('/api/nonexistent-endpoint-boundary-check-404');
      assertStatus(res, 404, 'Nonexistent API endpoint status');
      assertContentType(res, /application\/json/, 'Error response content type');

      const json = res.json<{ error?: { code?: string } }>();
      assert.ok(json.error !== undefined, 'Response must contain structured error JSON');
      assert.ok(!res.body.includes('<!DOCTYPE html>'), 'API route must never return HTML');
    },
  );

  await t.test(
    'T2.8: Nonexistent static asset under /assets/ returns 404, not SPA fallback',
    async () => {
      const res = await cfClient.get('/assets/nonexistent-missing-bundle-999.js');
      assertStatus(res, 404, 'Missing asset returns 404');
      assert.ok(
        !res.body.includes('<div id="app">'),
        'Missing asset must not fall back to serving SPA index.html',
      );
    },
  );

  await t.test(
    'T2.9: Client-side deep route returns 200 OK with SPA index.html (SPA Fallback)',
    async () => {
      const res = await cfClient.get('/orders/deep/link/view');
      assertStatus(res, 200, 'SPA deep link fallback');
      assertContentType(res, /text\/html/, 'SPA fallback content type');
      assert.ok(
        res.body.includes('<div id="app"') ||
          res.body.includes('Bull Dog Solution') ||
          res.body.includes('<!DOCTYPE html>'),
        'Must return SPA index.html for client-side routing',
      );
    },
  );

  await t.test(
    'T2.10: CORS preflight OPTIONS request returns valid preflight headers',
    async () => {
      const testOrigin = config.isMock ? 'http://localhost:5173' : config.cloudfrontUrl;
      const res = await cfClient.options('/api/v1/auth/login', {
        headers: {
          origin: testOrigin,
          'access-control-request-method': 'POST',
        },
      });
      assertStatus(res, [200, 204], 'CORS preflight status');
      assertHeaderMatches(res, 'access-control-allow-methods', /POST/i, 'CORS allowed methods');
    },
  );
});
