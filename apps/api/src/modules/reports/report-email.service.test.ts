import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ReportEmailService } from './report-email.service.js';
const actor = { userId: 'admin-1', role: 'ADMIN' as const };
const client = {
  id: 'client-1',
  clientSheetId: 'C1',
  name: 'Client',
  emails: [
    { id: 'email-1', email: 'one@example.invalid' },
    { id: 'email-2', email: 'two@example.invalid' },
  ],
};
function setup(enabled = true) {
  const prisma = {
    order: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'order-1',
          status: 'COMPLETED',
          clientSheetId: 'C1',
          folio: 'OS-1',
        }),
    },
    client: { findUnique: vi.fn().mockResolvedValue(client) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const reports = {
    readReadyPdfForDelivery: vi
      .fn()
      .mockResolvedValue({
        reportId: 'report-1',
        version: 2,
        bytes: Uint8Array.from([1, 2]),
        fileName: 'OS-1-v2.pdf',
      }),
  };
  const sender = { send: vi.fn().mockResolvedValue({ messageId: 'message-1' }) };
  return {
    prisma,
    reports,
    sender,
    service: new ReportEmailService(
      prisma as unknown as PrismaClient,
      reports,
      enabled ? sender : undefined,
    ),
  };
}
describe('ReportEmailService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });
  it('returns scoped client recipients and optional sender availability', async () => {
    expect(await ctx.service.recipients('order-1', actor)).toEqual({ client, configured: true });
    expect(ctx.prisma.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientSheetId: 'C1' } }),
    );
    expect((await setup(false).service.recipients('order-1', actor)).configured).toBe(false);
  });
  it('sends the exact requested report individually and audits attempt/result', async () => {
    const result = await ctx.service.send('order-1', actor, {
      reportId: 'report-1',
      recipientIds: ['email-2', 'email-1'],
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.version).toBe(2);
    expect(ctx.reports.readReadyPdfForDelivery).toHaveBeenCalledWith('order-1', 'report-1');
    expect(ctx.sender.send.mock.calls.map(([input]) => input.recipient)).toEqual([
      'two@example.invalid',
      'one@example.invalid',
    ]);
    expect(ctx.sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ pdf: Uint8Array.from([1, 2]), fileName: 'OS-1-v2.pdf' }),
    );
    expect(ctx.prisma.auditLog.create).toHaveBeenCalledTimes(4);
    expect(ctx.prisma.auditLog.create.mock.calls.map(([arg]) => arg.data.action)).toEqual([
      'SERVICE_ORDER_REPORT_EMAIL_ATTEMPTED',
      'SERVICE_ORDER_REPORT_EMAIL_SENT',
      'SERVICE_ORDER_REPORT_EMAIL_ATTEMPTED',
      'SERVICE_ORDER_REPORT_EMAIL_SENT',
    ]);
  });
  it('rejects technicians before any DB or provider operation', async () => {
    await expect(
      ctx.service.send(
        'order-1',
        { ...actor, role: 'TECHNICIAN' },
        { reportId: 'report-1', recipientIds: ['email-1'] },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ctx.service.recipients('order-1', { ...actor, role: 'TECHNICIAN' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(ctx.prisma.order.findUnique).not.toHaveBeenCalled();
    expect(ctx.sender.send).not.toHaveBeenCalled();
  });
  it('returns service unavailable when dedicated Gmail config is absent', async () => {
    const disabled = setup(false);
    await expect(
      disabled.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toMatchObject({ status: 503, code: 'REPORT_EMAIL_UNAVAILABLE' });
    expect(disabled.prisma.order.findUnique).not.toHaveBeenCalled();
  });
  it('rejects missing/non-completed orders', async () => {
    ctx.prisma.order.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      ctx.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toMatchObject({ status: 404 });
    ctx.prisma.order.findUnique.mockResolvedValueOnce({ status: 'IN_PROGRESS' } as never);
    await expect(
      ctx.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toMatchObject({ status: 409, code: 'ORDER_NOT_COMPLETED' });
    expect(ctx.sender.send).not.toHaveBeenCalled();
  });
  it.each([
    { recipientIds: [] },
    { recipientIds: ['email-1', 'email-1'] },
    { recipientIds: ['foreign-email'] },
  ])('rejects invalid recipients %j before PDF reads', async ({ recipientIds }) => {
    await expect(
      ctx.service.send('order-1', actor, { reportId: 'report-1', recipientIds }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_REPORT_RECIPIENTS' });
    expect(ctx.reports.readReadyPdfForDelivery).not.toHaveBeenCalled();
    expect(ctx.sender.send).not.toHaveBeenCalled();
  });
  it('requires a registered client and READY PDF before sending', async () => {
    ctx.prisma.client.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      ctx.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toMatchObject({ code: 'REPORT_CLIENT_NOT_REGISTERED' });
    ctx.reports.readReadyPdfForDelivery.mockRejectedValueOnce({
      status: 409,
      code: 'REPORT_NOT_READY',
    });
    await expect(
      ctx.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toMatchObject({ code: 'REPORT_NOT_READY' });
    expect(ctx.sender.send).not.toHaveBeenCalled();
  });
  it('sanitizes failures, reports partial success, and never retries failed recipients', async () => {
    ctx.sender.send.mockRejectedValueOnce(new Error('sensitive-provider-token-and-mime'));
    const result = await ctx.service.send('order-1', actor, {
      reportId: 'report-1',
      recipientIds: ['email-1', 'email-2'],
    });
    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.results[0]).toMatchObject({
      status: 'FAILED',
      failureCode: 'DELIVERY_UNCONFIRMED',
    });
    expect(result.results[1]?.status).toBe('SENT');
    expect(ctx.sender.send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([result, ctx.prisma.auditLog.create.mock.calls])).not.toContain(
      'sensitive-provider',
    );
  });
  it('reports total failure and prevents sending if intent audit cannot persist', async () => {
    ctx.sender.send.mockRejectedValueOnce(new Error('failed'));
    expect(
      (
        await ctx.service.send('order-1', actor, {
          reportId: 'report-1',
          recipientIds: ['email-1'],
        })
      ).status,
    ).toBe('FAILURE');
    const unaudited = setup();
    unaudited.prisma.auditLog.create.mockRejectedValueOnce(new Error('audit offline'));
    await expect(
      unaudited.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toThrow('audit offline');
    expect(unaudited.sender.send).not.toHaveBeenCalled();
  });
  it('rejects attachments over the application size cap', async () => {
    ctx.reports.readReadyPdfForDelivery.mockResolvedValueOnce({
      reportId: 'report-1',
      version: 2,
      bytes: new Uint8Array(20 * 1024 * 1024 + 1),
      fileName: 'large.pdf',
    });
    await expect(
      ctx.service.send('order-1', actor, { reportId: 'report-1', recipientIds: ['email-1'] }),
    ).rejects.toMatchObject({ status: 413 });
    expect(ctx.sender.send).not.toHaveBeenCalled();
  });
});
