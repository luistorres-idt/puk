import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportEmailResult } from '@puk/contracts';
import { addClientEmail } from '@/modules/clients';
import { fetchReportEmailRecipients, sendReportEmail } from './report-email.api.js';
import { useReportEmail } from './useReportEmail.js';
vi.mock('@/modules/clients', () => ({ addClientEmail: vi.fn() }));
vi.mock('./report-email.api.js', () => ({
  fetchReportEmailRecipients: vi.fn(),
  sendReportEmail: vi.fn(),
}));
const client = {
  id: 'client-1',
  clientSheetId: 'C1',
  name: 'Client',
  emails: [{ id: 'email-1', email: 'one@example.invalid' }],
};
const success: ReportEmailResult = {
  reportId: 'report-1',
  version: 2,
  attemptId: 'attempt-1',
  status: 'SUCCESS',
  results: [{ recipientId: 'email-1', email: 'one@example.invalid', status: 'SENT' }],
};
describe('manual report email state', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchReportEmailRecipients).mockResolvedValue({
      client: structuredClone(client),
      configured: true,
    });
  });
  it('loads recipients but never selects or sends implicitly', async () => {
    const state = useReportEmail('order-1', 'report-1');
    const pending = state.load();
    expect(state.loading.value).toBe(true);
    await pending;
    expect(state.client.value).toEqual(client);
    expect(state.selectedIds.value).toEqual([]);
    expect(state.loading.value).toBe(false);
    expect(sendReportEmail).not.toHaveBeenCalled();
  });
  it('adds normalized email inline through the client API and selects it', async () => {
    const state = useReportEmail('order-1', 'report-1');
    await state.load();
    vi.mocked(addClientEmail).mockResolvedValue({ id: 'email-2', email: 'new@example.invalid' });
    expect(await state.addEmail(' New@Example.invalid ')).toBe(true);
    expect(addClientEmail).toHaveBeenCalledWith(client.id, { email: 'new@example.invalid' });
    expect(state.client.value?.emails).toHaveLength(2);
    expect(state.selectedIds.value).toEqual(['email-2']);
    expect(sendReportEmail).not.toHaveBeenCalled();
  });
  it('requires configured Gmail, selection and valid inline email', async () => {
    const state = useReportEmail('order-1', 'report-1');
    await state.load();
    expect(await state.send()).toBe(false);
    expect(await state.addEmail('invalid')).toBe(false);
    expect(state.error.value).toContain('formato válido');
    state.selectedIds.value = ['email-1'];
    state.configured.value = false;
    expect(await state.send()).toBe(false);
    expect(sendReportEmail).not.toHaveBeenCalled();
    expect(addClientEmail).not.toHaveBeenCalled();
  });
  it('sends only on explicit action and removes successful recipients from retry selection', async () => {
    const state = useReportEmail('order-1', 'report-1');
    await state.load();
    state.selectedIds.value = ['email-1'];
    vi.mocked(sendReportEmail).mockResolvedValue(success);
    expect(await state.send()).toBe(true);
    expect(sendReportEmail).toHaveBeenCalledWith('order-1', {
      reportId: 'report-1',
      recipientIds: ['email-1'],
    });
    expect(state.result.value).toEqual(success);
    expect(state.selectedIds.value).toEqual([]);
  });
  it('preserves unconfirmed selections and exposes partial results without automatically retrying', async () => {
    const state = useReportEmail('order-1', 'report-1');
    await state.load();
    state.selectedIds.value = ['email-1', 'email-2'];
    vi.mocked(sendReportEmail).mockResolvedValue({
      ...success,
      status: 'PARTIAL_FAILURE',
      results: [
        ...success.results,
        {
          recipientId: 'email-2',
          email: 'two@example.invalid',
          status: 'FAILED',
          failureCode: 'DELIVERY_UNCONFIRMED',
        },
      ],
    });
    await state.send();
    expect(state.selectedIds.value).toEqual(['email-2']);
    expect(sendReportEmail).toHaveBeenCalledOnce();
  });
  it('handles loading/add/send errors with safe retry warning', async () => {
    const state = useReportEmail('order-1', 'report-1');
    vi.mocked(fetchReportEmailRecipients).mockRejectedValueOnce(new Error('unavailable'));
    await state.load();
    expect(state.loading.value).toBe(false);
    expect(state.error.value).toBe('unavailable');
    await state.load();
    state.selectedIds.value = ['email-1'];
    vi.mocked(sendReportEmail).mockRejectedValueOnce(new Error('timeout'));
    expect(await state.send()).toBe(false);
    expect(state.error.value).toContain('Enviados antes de reintentar');
    expect(state.sending.value).toBe(false);
    vi.mocked(addClientEmail).mockRejectedValueOnce(new Error('duplicate'));
    expect(await state.addEmail('new@example.invalid')).toBe(false);
    expect(state.error.value).toBe('duplicate');
    expect(state.adding.value).toBe(false);
  });
  it('suppresses duplicate submission while a send remains in flight', async () => {
    const state = useReportEmail('order-1', 'report-1');
    await state.load();
    state.selectedIds.value = ['email-1'];
    let finish!: (result: ReportEmailResult) => void;
    vi.mocked(sendReportEmail).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = state.send();
    expect(state.sending.value).toBe(true);
    expect(await state.send()).toBe(false);
    expect(sendReportEmail).toHaveBeenCalledOnce();
    finish(success);
    await pending;
    expect(state.sending.value).toBe(false);
  });
});
