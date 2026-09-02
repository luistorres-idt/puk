import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { errorHandler } from './error-handler.js';
import { requestId } from './request-id.js';
import { validate } from './validate.js';

describe('validate', () => {
  it('reports sanitized Valibot issues for invalid input', async () => {
    const app = express();
    app.use(requestId, express.json());
    app.post(
      '/validation-example',
      validate({ body: v.object({ name: v.pipe(v.string(), v.minLength(2)) }) }),
      (_request, response) => response.sendStatus(204),
    );
    app.use(errorHandler);

    const response = await request(app).post('/validation-example').send({ name: '' }).expect(400);
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: { issues: expect.any(Array) } },
      meta: { requestId: expect.any(String) },
    });
  });
});
