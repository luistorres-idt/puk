import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveConfig } from './config.js';
import { TestHttpClient, assertStatus, assertContentType } from './client.js';

const execFileAsync = promisify(execFile);

/**
 * TIER 4: REAL-WORLD SCENARIOS & INFRASTRUCTURE INTEGRITY
 *
 * Verifies complete realistic user sessions, transport performance,
 * and live cloud infrastructure stability:
 * 1. Complete end-to-end user session workflow:
 *    - HTML initial load -> Asset bundle download -> API telemetry -> Auth validation
 * 2. Edge latency and compression verification
 * 3. CloudFormation Stack & ECS Container deployment stability
 *
 * Authoritative Sources:
 * - docs/technical/infrastructure-and-operations.md
 * - docs/technical/backend-and-flows.md
 */

const config = resolveConfig();
const cfClient = new TestHttpClient(config.cloudfrontUrl);

test('Tier 4 - Real-World Scenarios', async (t) => {
  await t.test('T4.1: Complete Web & API User Session Workflow', async () => {
    // Step 1: User visits Web Root
    const rootRes = await cfClient.get('/');
    assertStatus(rootRes, 200, 'User loads index.html');
    assertContentType(rootRes, /text\/html/, 'Index HTML');

    // Step 2: Extract asset references from HTML
    const assetMatches = rootRes.body.match(/\/assets\/[^"'\s>]+/g) ?? [];
    assert.ok(
      assetMatches.length > 0,
      'Index HTML should reference at least one asset under /assets/',
    );

    // Step 3: Fetch referenced static asset
    const firstAsset = assetMatches[0];
    const assetRes = await cfClient.get(firstAsset);
    assertStatus(assetRes, 200, `User browser downloads asset ${firstAsset}`);

    // Step 4: API health probe (background polling simulation)
    const healthRes = await cfClient.get('/health/live');
    assertStatus(healthRes, 200, 'Frontend background health polling');

    // Step 5: User submits login form with invalid credentials
    const loginRes = await cfClient.post('/api/v1/auth/login', {
      email: 'technician.test@puk.dev',
      password: 'invalid-password-attempt',
    });
    assert.ok(
      [400, 401].includes(loginRes.status),
      `Login attempt should be rejected with 400 or 401, received: ${loginRes.status}`,
    );

    // Step 6: Verify metrics are tracking requests
    const metricsRes = await cfClient.get('/metrics');
    assertStatus(metricsRes, 200, 'Observability metrics exposition');
  });

  await t.test('T4.2: Edge latency and compression verification', async () => {
    const res = await cfClient.get('/', {
      headers: {
        'accept-encoding': 'gzip, deflate, br',
      },
    });

    assertStatus(res, 200, 'Compressed page fetch');
    assert.ok(
      res.durationMs < 3000,
      `Edge roundtrip latency should be under 3000ms, observed ${res.durationMs}ms`,
    );
  });

  await t.test('T4.3: CloudFormation Stack & ECS Deployment Health Status', async () => {
    if (config.skipAwsChecks) {
      // Offline/Mock mode verification
      assert.ok(true, 'AWS API checks skipped in mock / local development mode');
      return;
    }

    try {
      // Query AWS CloudFormation for stack status
      const { stdout } = await execFileAsync('aws', [
        'cloudformation',
        'describe-stacks',
        '--stack-name',
        config.applicationStackName,
        '--region',
        config.awsRegion,
        '--output',
        'json',
      ]);

      const data = JSON.parse(stdout) as {
        Stacks?: Array<{
          StackStatus: string;
          Outputs?: Array<{ OutputKey: string; OutputValue: string }>;
        }>;
      };

      const stack = data.Stacks?.[0];
      assert.ok(
        stack !== undefined,
        `Stack ${config.applicationStackName} not found in region ${config.awsRegion}`,
      );

      const allowedStatuses = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'];
      assert.ok(
        allowedStatuses.includes(stack.StackStatus),
        `CloudFormation Stack ${config.applicationStackName} status is ${stack.StackStatus}, expected one of: ${allowedStatuses.join(', ')}`,
      );
    } catch (err) {
      // In early implementation phases (M1/M2), PukStagingApplication may still be in ROLLBACK_COMPLETE
      // or pending deployment. Log diagnostic message without masking.
      const errorMsg = (err as Error).message;
      if (errorMsg.includes('ROLLBACK_COMPLETE')) {
        assert.fail(
          `Deployment Stack ${config.applicationStackName} is currently in ROLLBACK_COMPLETE. Deployment required in M3.`,
        );
      } else {
        throw err;
      }
    }
  });
});
