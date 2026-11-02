import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { UpdateTechnicalReportSyncScheduleSchema } from './sync.js';

describe('UpdateTechnicalReportSyncScheduleSchema', () => {
  const baseValid = {
    cutoffWeekday: 2,
    syncWeekday: 3,
    syncTime: '17:00',
    timeZone: 'America/Hermosillo',
  };

  it('accepts valid schedule without adminRecipientEmail', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, baseValid);
    expect(result.cutoffWeekday).toBe(2);
    expect(result.adminRecipientEmail).toBeUndefined();
  });

  it('normalizes valid adminRecipientEmail to trimmed lowercase', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, {
      ...baseValid,
      adminRecipientEmail: '  Admin.Ops@Company.com  ',
    });
    expect(result.adminRecipientEmail).toBe('admin.ops@company.com');
  });

  it('transforms empty string to null', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, {
      ...baseValid,
      adminRecipientEmail: '',
    });
    expect(result.adminRecipientEmail).toBeNull();
  });

  it('accepts explicit null', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, {
      ...baseValid,
      adminRecipientEmail: null,
    });
    expect(result.adminRecipientEmail).toBeNull();
  });

  it('rejects invalid email address', () => {
    expect(() =>
      v.parse(UpdateTechnicalReportSyncScheduleSchema, {
        ...baseValid,
        adminRecipientEmail: 'not-an-email',
      }),
    ).toThrow();
  });
});
