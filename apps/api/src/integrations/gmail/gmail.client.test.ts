import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailClient, GMAIL_SEND_SCOPE, buildReportMime } from './gmail.client.js';
const mocks = vi.hoisted(() => ({ send: vi.fn(), jwt: vi.fn() }));
vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: class {
        constructor(config: unknown) {
          mocks.jwt(config);
        }
      },
    },
    gmail: vi.fn(() => ({ users: { messages: { send: mocks.send } } })),
  },
}));
const config = {
  clientEmail: 'gmail-service@example.invalid',
  privateKey: 'synthetic-test-only\\nkey',
  senderEmail: 'reports@example.invalid',
};
const input = {
  recipient: 'client@example.invalid',
  subject: 'Reporte versión 2\r\nBcc: ignored',
  text: 'Versión técnica',
  fileName: 'report.pdf',
  pdf: Uint8Array.from([37, 80, 68, 70, 0, 255]),
};
describe('Gmail MIME delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ data: { id: 'gmail-message-1' } });
  });
  it('builds base64url multipart MIME with one recipient and exact PDF bytes', () => {
    const raw = buildReportMime(config.senderEmail, input);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: reports@example.invalid\r\nTo: client@example.invalid');
    expect(mime.match(/^To:/gm)).toHaveLength(1);
    expect(mime).not.toMatch(/^(Cc|Bcc):/m);
    expect(mime).toContain('Content-Type: application/pdf; name="report.pdf"');
    expect(mime).toContain(Buffer.from(input.pdf).toString('base64'));
    expect(mime).toContain(Buffer.from(input.text).toString('base64'));
    expect(mime.split('Content-Transfer-Encoding: base64')).toHaveLength(3);
  });
  it('rejects mailbox header injection and sanitizes attachment filenames', () => {
    expect(() =>
      buildReportMime(config.senderEmail, {
        ...input,
        recipient: 'a@example.invalid\r\nBcc: b@example.invalid',
      }),
    ).toThrow('Invalid mail address');
    const mime = Buffer.from(
      buildReportMime(config.senderEmail, { ...input, fileName: 'a"\r\nBcc:b.pdf' }),
      'base64url',
    ).toString();
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).toContain('filename="a---Bcc-b.pdf"');
  });
  it('folds UTF-8 subjects within encoded-word limits and base64 attachment lines', () => {
    const mime = Buffer.from(
      buildReportMime(config.senderEmail, {
        ...input,
        subject: 'á'.repeat(100),
        pdf: new Uint8Array(150),
      }),
      'base64url',
    ).toString();
    for (const encoded of mime.match(/=\?UTF-8\?B\?.*?\?=/g) ?? [])
      expect(encoded.length).toBeLessThanOrEqual(75);
    expect(mime).not.toMatch(/(?<!\r)\n/);
  });
  it('uses only gmail.send and impersonates the dedicated mailbox', async () => {
    const client = new GmailClient(config);
    await expect(client.send(input)).resolves.toEqual({ messageId: 'gmail-message-1' });
    expect(mocks.jwt).toHaveBeenCalledWith({
      email: config.clientEmail,
      key: 'synthetic-test-only\nkey',
      subject: config.senderEmail,
      scopes: [GMAIL_SEND_SCOPE],
      forceRefreshOnFailure: false,
    });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', requestBody: { raw: expect.any(String) } }),
      { retry: false, timeout: 15_000 },
    );
  });
  it('does not retry errors or invent successful delivery without message ID', async () => {
    const client = new GmailClient(config);
    mocks.send.mockRejectedValueOnce(new Error('mock provider failure'));
    await expect(client.send(input)).rejects.toThrow('mock provider failure');
    expect(mocks.send).toHaveBeenCalledOnce();
    mocks.send.mockResolvedValueOnce({ data: {} });
    await expect(client.send(input)).rejects.toThrow('did not confirm');
  });
});
