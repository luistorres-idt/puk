import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { TokenService } from '../auth/tokens.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { ExecutionService } from '../modules/execution/index.js';
import { logger } from '../observability/logger.js';
import { AppError } from '../shared/errors.js';
import { errorHandler } from './error-handler.js';
import { requestId } from './request-id.js';

const JSON_LIMIT = 1_048_576;
const REQUEST_ID = 'json-parser-test';

function jsonPayload(bytes: number, body = '{"padding":"ASCII"}') {
  const payload = body + ' '.repeat(bytes - Buffer.byteLength(body, 'utf8'));
  expect(Buffer.byteLength(payload, 'utf8')).toBe(bytes);
  return payload;
}

function harness(error?: unknown) {
  const handler = vi.fn();
  const app = express();
  app.use(requestId);
  app.use(express.json({ limit: '1mb' }));
  app.post('/json', (req, res, next) => {
    handler(req.body);
    if (error !== undefined) next(error);
    else res.json({ accepted: true });
  });
  app.use(errorHandler);
  return { app, handler };
}

function expectEnvelope(body: unknown, code: string, message: string) {
  expect(body).toEqual({ error: { code, message }, meta: { requestId: REQUEST_ID } });
}

beforeEach(() => vi.spyOn(logger, 'log').mockImplementation(() => logger));
afterEach(() => vi.restoreAllMocks());

describe('JSON parser error classification', () => {
  it('returns INVALID_JSON without executing the handler or exposing parser internals', async () => {
    const h = harness();
    const response = await request(h.app)
      .post('/json')
      .set('X-Request-Id', REQUEST_ID)
      .type('json')
      .send('{"private-marker":');
    expect(response.status).toBe(400);
    expectEnvelope(response.body, 'INVALID_JSON', 'The request body must contain valid JSON.');
    expect(response.headers['x-request-id']).toBe(REQUEST_ID);
    expect(h.handler).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('private-marker');
  });

  it('permits valid JSON of exactly 1,048,576 bytes', async () => {
    const h = harness();
    const response = await request(h.app).post('/json').type('json').send(jsonPayload(JSON_LIMIT));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accepted: true });
    expect(h.handler).toHaveBeenCalledExactlyOnceWith({ padding: 'ASCII' });
  });

  it('rejects 1,048,577 bytes without executing the handler or exposing parser internals', async () => {
    const h = harness();
    const response = await request(h.app)
      .post('/json')
      .set('X-Request-Id', REQUEST_ID)
      .type('json')
      .send(jsonPayload(JSON_LIMIT + 1));
    expect(response.status).toBe(413);
    expectEnvelope(
      response.body,
      'PAYLOAD_TOO_LARGE',
      'The request body exceeds the maximum allowed size.',
    );
    expect(h.handler).not.toHaveBeenCalled();
  });

  it.each([
    new Error('private unexpected error'),
    new SyntaxError('private non-parser syntax error'),
    { status: 400, message: 'private arbitrary bad request' },
    Object.assign(new SyntaxError('private unclassified syntax error'), { status: 400 }),
    Object.assign(new Error('private unsupported parser error'), {
      status: 400,
      type: 'request.aborted',
    }),
  ])('keeps unexpected errors sanitized as 500: %#', async (error) => {
    const h = harness(error);
    const response = await request(h.app)
      .post('/json')
      .set('X-Request-Id', REQUEST_ID)
      .send({ valid: true });
    expect(response.status).toBe(500);
    expectEnvelope(response.body, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    expect(h.handler).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing AppError including its intentional public details', async () => {
    const h = harness(
      new AppError(409, 'EXISTING_CONFLICT', 'Existing public message', { field: 'version' }),
    );
    const response = await request(h.app)
      .post('/json')
      .set('X-Request-Id', REQUEST_ID)
      .send({ valid: true });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'EXISTING_CONFLICT',
        message: 'Existing public message',
        details: { field: 'version' },
      },
      meta: { requestId: REQUEST_ID },
    });
  });

  it('preserves the binary parser AppError classification', async () => {
    const h = harness(new AppError(413, 'FILE_TOO_LARGE', 'Existing binary limit message'));
    const response = await request(h.app)
      .post('/json')
      .set('X-Request-Id', REQUEST_ID)
      .send({ valid: true });
    expect(response.status).toBe(413);
    expectEnvelope(response.body, 'FILE_TOO_LARGE', 'Existing binary limit message');
  });
});

describe('createApp JSON parser mounting', () => {
  function appHarness() {
    const updateExecutionNotes = vi
      .fn()
      .mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', generalNotes: 'ok' });
    const verifyAccessToken = vi
      .fn()
      .mockResolvedValue({ role: 'ADMIN', sub: 'actor-1', type: 'access' });
    const resolve = vi.fn().mockResolvedValue({ id: 'actor-1', role: 'ADMIN' });
    const app = createApp({
      auth: {
        cookie: { httpOnly: true, sameSite: 'lax', secure: false, path: '/' },
        minimumPasswordLength: 12,
        prisma: {} as PrismaClient,
        tokens: { verifyAccessToken } as unknown as TokenService,
        principalResolver: { resolve },
      },
      executionService: {
        getEvidenceUploadLimit: () => 1024,
        getSignatureUploadLimit: () => 1024,
        updateExecutionNotes,
      } as unknown as ExecutionService,
    });
    return { app, updateExecutionNotes, verifyAccessToken, resolve };
  }

  it.each([
    {
      name: 'malformed JSON',
      payload: '{"private-marker":',
      status: 400,
      code: 'INVALID_JSON',
      message: 'The request body must contain valid JSON.',
    },
    {
      name: 'oversized JSON',
      payload: jsonPayload(JSON_LIMIT + 1, '{"notes":"ok"}'),
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request body exceeds the maximum allowed size.',
    },
  ])(
    'classifies $name before authentication/services with requestId available',
    async ({ payload, status, code, message }) => {
      const h = appHarness();
      const response = await request(h.app)
        .patch('/api/v1/orders/00000000-0000-4000-8000-000000000001/execution-notes')
        .set('Authorization', 'Bearer test-session')
        .set('X-Request-Id', REQUEST_ID)
        .type('json')
        .send(payload);
      expect(response.status).toBe(status);
      expectEnvelope(response.body, code, message);
      expect(response.headers['x-request-id']).toBe(REQUEST_ID);
      expect(h.updateExecutionNotes).not.toHaveBeenCalled();
      expect(h.verifyAccessToken).not.toHaveBeenCalled();
      expect(h.resolve).not.toHaveBeenCalled();
    },
  );

  it('permits the exact byte boundary through the real app and injected authenticated service', async () => {
    const h = appHarness();
    const response = await request(h.app)
      .patch('/api/v1/orders/00000000-0000-4000-8000-000000000001/execution-notes')
      .set('Authorization', 'Bearer test-session')
      .type('json')
      .send(jsonPayload(JSON_LIMIT, '{"notes":"ok"}'));
    expect(response.status).toBe(200);
    expect(h.resolve).toHaveBeenCalledWith('actor-1');
    expect(h.updateExecutionNotes).toHaveBeenCalledExactlyOnceWith(
      'actor-1',
      'ADMIN',
      '00000000-0000-4000-8000-000000000001',
      { notes: 'ok' },
    );
  });
});
