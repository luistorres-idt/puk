import { describe, expect, it } from 'vitest';
import { safeParse } from 'valibot';
import { SendReportEmailSchema } from './report-email.js';
const id = '00000000-0000-4000-8000-000000000001';
const recipient = '00000000-0000-4000-8000-000000000002';
describe('manual report email contracts', () => {
  it('requires an explicit report and registered recipient identifiers', () => {
    expect(
      safeParse(SendReportEmailSchema, { reportId: id, recipientIds: [recipient] }).success,
    ).toBe(true);
    expect(safeParse(SendReportEmailSchema, { recipientIds: [recipient] }).success).toBe(false);
    expect(safeParse(SendReportEmailSchema, { reportId: id, recipientIds: [] }).success).toBe(
      false,
    );
    expect(
      safeParse(SendReportEmailSchema, { reportId: id, recipientIds: ['not-an-id'] }).success,
    ).toBe(false);
  });
  it('rejects duplicate or excessive recipients and arbitrary addresses', () => {
    expect(
      safeParse(SendReportEmailSchema, { reportId: id, recipientIds: [recipient, recipient] })
        .success,
    ).toBe(false);
    expect(
      safeParse(SendReportEmailSchema, { reportId: id, recipientIds: Array(21).fill(recipient) })
        .success,
    ).toBe(false);
    expect(
      safeParse(SendReportEmailSchema, {
        reportId: id,
        recipientIds: [recipient],
        email: 'foreign@example.invalid',
      }).success,
    ).toBe(false);
  });
});
