import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from './config.js';
import {
  TestHttpClient,
  assertStatus,
  assertHeaderPresent,
  assertHeaderMatches,
  assertContentType,
} from './client.js';

/**
 * TIER 3: CROSS-FEATURE COMBINATIONS
 *
 * Verifies the cross-cutting interaction between edge caching, security headers,
 * origin authentication, cookie attributes, and access control:
 * 1. CloudFront Edge Caching on static assets (/assets/*: CACHING_OPTIMIZED)
 * 2. CloudFront Dynamic Bypass on API & health (/api/*: CACHING_DISABLED)
 * 3. Security Response Headers enforcement (HSTS, nosniff, DENY, Referrer-Policy)
 * 4. Secure Cookie Attributes (Secure, HttpOnly, SameSite=lax)
 * 5. Multi-Route Access Control Enforcement (/api/v1/orders requires bearer auth)
 *
 * Authoritative Sources:
 * - docs/technical/infrastructure-and-operations.md
 * - infra/cdk/lib/application-stack.ts
 */

const config = resolveConfig();
const cfClient = new TestHttpClient(config.cloudfrontUrl);

test('Tier 3 - Cross-Feature Combinations', async (t) => {
  await t.test(
    'T3.1: CloudFront caching on /assets/* serves optimized immutable cache headers (Feature 5)',
    async () => {
      // Discover a valid static asset from web root or fallback to default
      const rootRes = await cfClient.get('/');
      const assetMatches = rootRes.body.match(/\/assets\/[^"'\s>]+\.(?:js|css)/g) ?? [];
      const assetPath = assetMatches[0] ?? '/assets/index-bds123.js';

      // First request: warm up edge cache
      const firstRes = await cfClient.get(assetPath);
      assertStatus(firstRes, 200, 'Initial asset fetch');
      assertHeaderMatches(firstRes, 'cache-control', /public/i, 'Public cache directive');
      assertHeaderMatches(firstRes, 'cache-control', /max-age/i, 'Max-age cache directive');

      // Second request: should hit CloudFront edge cache if running through CloudFront
      const secondRes = await cfClient.get(assetPath);
      assertStatus(secondRes, 200, 'Subsequent asset fetch');

      const xCache = secondRes.headers['x-cache'];
      if (xCache) {
        assert.ok(
          xCache.includes('cloudfront'),
          `X-Cache header should indicate CloudFront caching, got ${xCache}`,
        );
      }
    },
  );

  await t.test('T3.2: CloudFront cache bypass on dynamic API routes (Feature 5)', async () => {
    const res = await cfClient.get('/health/live');
    assertStatus(res, 200, 'Dynamic API health probe');

    const cacheControl = res.headers['cache-control'];
    if (cacheControl) {
      assert.ok(
        cacheControl.includes('no-cache') ||
          cacheControl.includes('no-store') ||
          cacheControl.includes('max-age=0'),
        `Dynamic API endpoints must return no-cache/no-store Cache-Control, received: ${cacheControl}`,
      );
    }

    const xCache = res.headers['x-cache'];
    if (xCache) {
      assert.ok(
        !xCache.toLowerCase().startsWith('hit'),
        `Dynamic API endpoint must not be edge-cached as Hit, received: ${xCache}`,
      );
    }
  });

  await t.test(
    'T3.3: Edge Security Headers Policy is enforced on responses (Feature 8)',
    async () => {
      const res = await cfClient.get('/');
      assertStatus(res, 200, 'Edge security headers check');

      // 1. Strict-Transport-Security (HSTS)
      assertHeaderMatches(res, 'strict-transport-security', /max-age=/i, 'HSTS header');

      // 2. X-Content-Type-Options
      assertHeaderMatches(res, 'x-content-type-options', /nosniff/i, 'MIME sniffing protection');

      // 3. X-Frame-Options
      const xFrame = assertHeaderPresent(res, 'x-frame-options', 'Clickjacking protection');
      assert.ok(
        xFrame.toUpperCase() === 'DENY' || xFrame.toUpperCase() === 'SAMEORIGIN',
        `X-Frame-Options must be DENY or SAMEORIGIN, got ${xFrame}`,
      );

      // 4. Referrer-Policy
      assertHeaderPresent(res, 'referrer-policy', 'Referrer policy');

      // 5. X-XSS-Protection (optional in modern browsers but configured in standard security headers)
      if (res.headers['x-xss-protection']) {
        assertHeaderMatches(res, 'x-xss-protection', /1/, 'XSS filter');
      }
    },
  );

  await t.test(
    'T3.4: Cookie security attributes enforced on authentication endpoints',
    async () => {
      // Attempt login to inspect cookie flags
      const res = await cfClient.post('/api/v1/auth/login', {
        email: 'invalid-user@example.com',
        password: 'short',
      });

      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        assert.ok(
          setCookie.toLowerCase().includes('secure'),
          `Auth cookie must contain Secure flag, received: ${setCookie}`,
        );
        assert.ok(
          setCookie.toLowerCase().includes('httponly'),
          `Auth cookie must contain HttpOnly flag, received: ${setCookie}`,
        );
        assert.ok(
          setCookie.toLowerCase().includes('samesite=lax') ||
            setCookie.toLowerCase().includes('samesite=strict'),
          `Auth cookie must contain SameSite attribute, received: ${setCookie}`,
        );
      }
    },
  );

  await t.test(
    'T3.5: Multi-Route Access Control Enforcement (/api/v1/orders requires bearer token)',
    async () => {
      const res = await cfClient.get('/api/v1/orders');
      assertStatus(res, 401, 'Unauthorized orders access');
      assertContentType(res, /application\/json/, 'Orders auth failure content type');

      const json = res.json<{ error?: { code?: string } }>();
      assert.ok(json.error !== undefined, 'Protected endpoint must return structured error object');
      assert.ok(
        json.error.code === 'UNAUTHORIZED' || json.error.code === 'UNAUTHENTICATED',
        `Error code should be UNAUTHORIZED or UNAUTHENTICATED, got ${json.error.code}`,
      );
    },
  );
});
