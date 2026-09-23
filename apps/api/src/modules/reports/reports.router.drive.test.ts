import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { ReportsService } from './reports.service.js';
import { createReportsRouter } from './reports.router.js';

type Handler = (request: Request, response: Response) => Promise<void> | void;
type RouteLayer = { route?: { path: string; stack: Array<{ handle: Handler }> } };

function harness() {
  const reportsService = {
    getDownloadFile: vi.fn().mockResolvedValue({
      bytes: Uint8Array.from([1, 2, 3]),
      fileName: 'orden-servicio-OS-1-v1.pdf',
    }),
  };
  const router = createReportsRouter({
    reportsService: reportsService as unknown as ReportsService,
    requireAccess: (_request, _response, next) => next(),
  });
  const route = (path: string) => {
    const layer = (router as unknown as { stack: RouteLayer[] }).stack.find(
      (entry) => entry.route?.path === path,
    );
    if (!layer?.route) throw new Error(`Missing route ${path}`);
    return layer.route.stack.at(-1)!.handle;
  };
  const response = { setHeader: vi.fn(), send: vi.fn() };
  const request = {
    auth: { userId: 'admin-1', role: 'ADMIN' },
    params: { id: 'order-1', version: '1' },
  } as unknown as Request;
  return { reportsService, route, request, response };
}

describe('Drive report HTTP handlers', () => {
  it('downloads a selected version as private PDF bytes', async () => {
    const { reportsService, route, request, response } = harness();
    await route('/:id/reports/:version/file')(request, response as unknown as Response);
    expect(reportsService.getDownloadFile).toHaveBeenCalledWith('order-1', 'admin-1', 'ADMIN', 1);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it('rejects versions outside the safe integer range', async () => {
    const { reportsService, route, request, response } = harness();
    request.params.version = '999999999999999999999999';
    await expect(
      route('/:id/reports/:version/file')(request, response as unknown as Response),
    ).rejects.toMatchObject({ code: 'INVALID_REPORT_VERSION', status: 400 });
    expect(reportsService.getDownloadFile).not.toHaveBeenCalled();
  });
});
