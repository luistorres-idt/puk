import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { HealthResponseSchema } from './health.js';

describe('HealthResponseSchema', () => {
  it('accepts the API liveness response', () => {
    const response = { data: { service: 'api', status: 'ok' }, meta: { requestId: 'request-1' } };
    expect(v.parse(HealthResponseSchema, response)).toEqual({
      data: { service: 'api', status: 'ok' },
      meta: { requestId: 'request-1' },
    });
  });

  it('rejects an unhealthy response', () => {
    expect(() =>
      v.parse(HealthResponseSchema, {
        data: { service: 'api', status: 'down' },
        meta: { requestId: 'request-1' },
      }),
    ).toThrow();
  });
});
