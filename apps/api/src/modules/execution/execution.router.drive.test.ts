import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { ExecutionService } from './execution.service.js';
import { createExecutionRouter } from './execution.router.js';

type Handler = (request: Request, response: Response) => Promise<void> | void;
type RouteLayer = {
  route?: {
    methods?: Record<string, boolean>;
    path: string;
    stack: Array<{ handle: Handler }>;
  };
};

function harness() {
  const service = {
    validateCompleteness: vi.fn().mockResolvedValue({ isComplete: true, missingRequirements: [] }),
    getEvidenceUploadLimit: vi.fn(() => 1024),
    getSignatureUploadLimit: vi.fn(() => 1024),
    uploadEvidenceFile: vi.fn().mockResolvedValue({ id: 'evidence-1' }),
    uploadSignatureFile: vi.fn().mockResolvedValue({ id: 'signature-1' }),
    getEvidenceFile: vi
      .fn()
      .mockResolvedValue({ body: Uint8Array.from([1, 2]), mimeType: 'image/jpeg' }),
    getSignatureFile: vi.fn().mockResolvedValue({
      body: Uint8Array.from([3, 4]),
      mimeType: 'image/png',
      signerName: 'María O’Neil',
    }),
  };
  const router = createExecutionRouter({
    executionService: service as unknown as ExecutionService,
    requireAccess: (_request, _response, next) => next(),
  });
  const route = (path: string, method?: 'get' | 'put' | 'post' | 'delete') => {
    const layer = (router as unknown as { stack: RouteLayer[] }).stack.find(
      (entry) =>
        entry.route?.path === path &&
        (method === undefined || Boolean(entry.route.methods?.[method])),
    );
    if (!layer?.route) throw new Error(`Missing route ${path}`);
    return layer.route.stack.at(-1)!.handle;
  };
  const response = {
    locals: { requestId: 'request-1' },
    setHeader: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  const auth = { userId: 'admin-1', role: 'ADMIN' };
  return { service, route, response, auth };
}

describe('Drive execution HTTP handlers', () => {
  it('passes raw evidence bytes, content type and image dimensions to the service', async () => {
    const { route, response, service, auth } = harness();
    const bytes = Buffer.from([1, 2, 3]);
    const headers = {
      'content-type': 'image/jpeg',
      'x-image-width': '2',
      'x-image-height': '3',
      'idempotency-key': '234edc7a-d596-4b6b-95e4-34107e78485f',
    };
    const request = {
      auth,
      params: { id: 'order-1', unitId: 'unit-1' },
      body: bytes,
      header: (name: string) => headers[name.toLowerCase() as keyof typeof headers],
    } as unknown as Request;
    await route('/orders/:id/units/:unitId/evidence/file')(
      request,
      response as unknown as Response,
    );
    expect(service.uploadEvidenceFile).toHaveBeenCalledWith(
      'admin-1',
      'ADMIN',
      'order-1',
      'unit-1',
      bytes,
      'image/jpeg',
      { width: 2, height: 3 },
      '234edc7a-d596-4b6b-95e4-34107e78485f',
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('returns binary evidence with private caching headers', async () => {
    const { route, response, service, auth } = harness();
    const request = { auth, params: { id: 'evidence-1' } } as unknown as Request;
    await route('/evidence/:id/file')(request, response as unknown as Response);
    expect(service.getEvidenceFile).toHaveBeenCalledWith('admin-1', 'ADMIN', 'evidence-1');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.send).toHaveBeenCalledWith(Buffer.from([1, 2]));
  });

  it('returns the signer name with the private signature preview', async () => {
    const { route, response, service, auth } = harness();
    const request = { auth, params: { id: 'order-1' } } as unknown as Request;
    await route('/orders/:id/signature/file', 'get')(request, response as unknown as Response);
    expect(service.getSignatureFile).toHaveBeenCalledWith('admin-1', 'ADMIN', 'order-1');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.setHeader).toHaveBeenCalledWith('X-Signer-Name', 'Mar%C3%ADa%20O%E2%80%99Neil');
    expect(response.send).toHaveBeenCalledWith(Buffer.from([3, 4]));
  });

  it('passes PNG signature bytes and signer name without a client-supplied file ID', async () => {
    const { route, response, service, auth } = harness();
    const bytes = Buffer.from([4, 5, 6]);
    const request = {
      auth,
      params: { id: 'order-1' },
      body: bytes,
      header: (name: string) => {
        if (name === 'Content-Type') return 'image/png';
        if (name === 'X-Signer-Name') return 'Client One';
        if (name === 'Idempotency-Key') return '234edc7a-d596-4b6b-95e4-34107e78485f';
        return undefined;
      },
    } as unknown as Request;
    await route('/orders/:id/signature/file')(request, response as unknown as Response);
    expect(service.uploadSignatureFile).toHaveBeenCalledWith(
      'admin-1',
      'ADMIN',
      'order-1',
      bytes,
      'Client One',
      '234edc7a-d596-4b6b-95e4-34107e78485f',
    );
  });

  it('rejects invalid dimension headers before the service sees a file', async () => {
    const { route, response, service, auth } = harness();
    const request = {
      auth,
      params: { id: 'order-1', unitId: 'unit-1' },
      body: Buffer.from([1]),
      header: (name: string) => (name === 'X-Image-Width' ? '0' : 'image/jpeg'),
    } as unknown as Request;
    await expect(
      route('/orders/:id/units/:unitId/evidence/file')(request, response as unknown as Response),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE_DIMENSION' });
    expect(service.uploadEvidenceFile).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'height', width: '2', height: '0' },
    { name: 'pixel count', width: '8001', height: '5000' },
  ])(
    'rejects invalid $name declarations before the service sees a file',
    async ({ width, height }) => {
      const { route, response, service, auth } = harness();
      const headers = {
        'content-type': 'image/jpeg',
        'x-image-width': width,
        'x-image-height': height,
        'idempotency-key': '234edc7a-d596-4b6b-95e4-34107e78485f',
      };
      const request = {
        auth,
        params: { id: 'order-1', unitId: 'unit-1' },
        body: Buffer.from([1]),
        header: (name: string) => headers[name.toLowerCase() as keyof typeof headers],
      } as unknown as Request;
      await expect(
        route('/orders/:id/units/:unitId/evidence/file')(request, response as unknown as Response),
      ).rejects.toMatchObject({ code: 'INVALID_IMAGE_DIMENSION' });
      expect(service.uploadEvidenceFile).not.toHaveBeenCalled();
    },
  );
});

describe('completeness handler actor forwarding', () => {
  it('forwards only the authenticated principal and route order ID', async () => {
    const { route, response, service, auth } = harness();
    await route('/orders/:id/completeness', 'get')(
      {
        auth,
        params: { id: 'order-1' },
        query: { userId: 'attacker', role: 'ADMIN' },
      } as unknown as Request,
      response as unknown as Response,
    );
    expect(service.validateCompleteness).toHaveBeenCalledExactlyOnceWith(
      'admin-1',
      'ADMIN',
      'order-1',
    );
    expect(response.json).toHaveBeenCalledWith({
      data: { isComplete: true, missingRequirements: [] },
      meta: { requestId: 'request-1' },
    });
  });
});
