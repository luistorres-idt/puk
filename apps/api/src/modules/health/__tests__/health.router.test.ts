import { HealthResponseSchema } from '@puk/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { createApp } from '../../../app.js';

describe('GET /health/live', () => {
  it('returns a contract-valid liveness response', async () => {
    const response = await request(createApp()).get('/health/live').expect(200);

    expect(v.parse(HealthResponseSchema, response.body)).toMatchObject({
      data: { service: 'api', status: 'ok' },
      meta: { requestId: expect.any(String) },
    });
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });

  it('propagates a valid caller request id', async () => {
    const response = await request(createApp())
      .get('/health/live')
      .set('x-request-id', 'test-request-42')
      .expect(200);
    expect(response.body.meta.requestId).toBe('test-request-42');
  });

  it('exposes the signature signer-name response header to browser clients', async () => {
    const response = await request(createApp())
      .get('/health/live')
      .set('Origin', 'http://localhost:5173')
      .expect(200);

    expect(response.headers['access-control-expose-headers']).toContain('X-Signer-Name');
  });

  it('reports dependency readiness', async () => {
    await request(createApp({ dependencyCheck: async () => true }))
      .get('/health/ready')
      .expect(200);
    const response = await request(createApp({ dependencyCheck: async () => false }))
      .get('/health/ready')
      .expect(503);
    expect(response.body.data.status).toBe('degraded');
  });

  it('uses the standard error response', async () => {
    const response = await request(createApp()).get('/missing').expect(404);
    expect(response.body).toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND' },
      meta: { requestId: expect.any(String) },
    });
  });
});
