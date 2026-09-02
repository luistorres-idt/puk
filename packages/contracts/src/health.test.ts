import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('accepts the API liveness response', () => {
    expect(v.parse(HealthResponseSchema, { service: 'api', status: 'ok' })).toEqual({
      service: 'api',
      status: 'ok',
    });
  });

  it('rejects an unhealthy response', () => {
    expect(() => v.parse(HealthResponseSchema, { service: 'api', status: 'down' })).toThrow();
  });
});
