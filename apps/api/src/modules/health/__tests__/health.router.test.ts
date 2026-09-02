import { HealthResponseSchema } from '@puk/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { createApp } from '../../../app.js';

describe('GET /health/live', () => {
  it('returns a contract-valid liveness response', async () => {
    const response = await request(createApp()).get('/health/live').expect(200);

    expect(v.parse(HealthResponseSchema, response.body)).toEqual({
      service: 'api',
      status: 'ok',
    });
  });
});
