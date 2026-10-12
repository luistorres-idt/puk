import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import * as v from 'valibot';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export interface ReportMailInput {
  recipient: string;
  subject: string;
  text: string;
  fileName: string;
  pdf: Uint8Array;
}
export interface ReportMailPort {
  send(input: ReportMailInput): Promise<{ messageId: string }>;
}
export interface GmailConfig {
  clientEmail: string;
  privateKey: string;
  senderEmail: string;
}

export class GmailClient implements ReportMailPort {
  private readonly gmail;
  public constructor(private readonly config: GmailConfig) {
    assertMailbox(config.clientEmail);
    assertMailbox(config.senderEmail);
    const auth = new google.auth.JWT({
      email: config.clientEmail,
      key: config.privateKey.replaceAll('\\n', '\n'),
      scopes: [GMAIL_SEND_SCOPE],
      subject: config.senderEmail,
      forceRefreshOnFailure: false,
    });
    this.gmail = google.gmail({ version: 'v1', auth });
  }
  public async send(input: ReportMailInput): Promise<{ messageId: string }> {
    const response = await this.gmail.users.messages.send(
      {
        userId: 'me',
        requestBody: { raw: buildReportMime(this.config.senderEmail, input) },
      },
      { retry: false, timeout: 15_000 },
    );
    if (!response.data.id) throw new Error('Gmail did not confirm a message ID.');
    return { messageId: response.data.id };
  }
}

export function buildReportMime(sender: string, input: ReportMailInput): string {
  assertMailbox(sender);
  assertMailbox(input.recipient);
  const boundary = `puk-${randomUUID()}`;
  const fileName =
    input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 150) || 'service-order.pdf';
  const mime = [
    `From: ${sender}`,
    `To: ${input.recipient}`,
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(input.text, 'utf8')),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${fileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${fileName}"`,
    '',
    base64Lines(input.pdf),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}
function assertMailbox(value: string): void {
  if (/[\r\n]/.test(value) || !v.safeParse(v.pipe(v.string(), v.email()), value).success)
    throw new Error('Invalid mail address.');
}
function base64Lines(bytes: Uint8Array): string {
  return (
    Buffer.from(bytes)
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? ''
  );
}
function encodeSubject(subject: string): string {
  const chunks: string[] = [];
  let current = '';
  for (const char of subject) {
    if (Buffer.byteLength(current + char) > 42) {
      chunks.push(current);
      current = '';
    }
    current += char;
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`)
    .join('\r\n ');
}
