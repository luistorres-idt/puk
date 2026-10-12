import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/http/client.js';
import { fetchReportEmailRecipients, sendReportEmail } from './report-email.api.js';
vi.mock('@/shared/http/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
describe('report email adapter', () => {
  beforeEach(() => vi.resetAllMocks());
  it('loads client-scoped recipients without a download request', async () => {
    const context = { configured: true, client: null };
    vi.mocked(api.get).mockResolvedValue({ data: { data: context } } as never);
    expect(await fetchReportEmailRecipients('order-1')).toEqual(context);
    expect(api.get).toHaveBeenCalledWith('/orders/order-1/report/recipients');
  });
  it('sends explicit PDF and registered recipient identifiers', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { status: 'SUCCESS' } } } as never);
    expect(
      await sendReportEmail('order-1', { reportId: 'report-1', recipientIds: ['recipient-1'] }),
    ).toEqual({ status: 'SUCCESS' });
    expect(api.post).toHaveBeenCalledWith('/orders/order-1/report/send', {
      reportId: 'report-1',
      recipientIds: ['recipient-1'],
    });
  });
});
