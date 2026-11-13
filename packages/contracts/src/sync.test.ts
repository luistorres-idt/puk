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

  it('accepts valid schedule without adminRecipientEmail or consolidatedRecipientEmail', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, baseValid);
    expect(result.cutoffWeekday).toBe(2);
    expect(result.adminRecipientEmail).toBeUndefined();
    expect(result.consolidatedRecipientEmail).toBeUndefined();
  });

  it('normalizes valid adminRecipientEmail and consolidatedRecipientEmail to trimmed lowercase', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, {
      ...baseValid,
      adminRecipientEmail: '  Admin.Ops@Company.com  ',
      consolidatedRecipientEmail: '  Consolidated@Company.com  ',
    });
    expect(result.adminRecipientEmail).toBe('admin.ops@company.com');
    expect(result.consolidatedRecipientEmail).toBe('consolidated@company.com');
  });

  it('transforms empty string to null', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, {
      ...baseValid,
      adminRecipientEmail: '',
      consolidatedRecipientEmail: '',
    });
    expect(result.adminRecipientEmail).toBeNull();
    expect(result.consolidatedRecipientEmail).toBeNull();
  });

  it('accepts explicit null', () => {
    const result = v.parse(UpdateTechnicalReportSyncScheduleSchema, {
      ...baseValid,
      adminRecipientEmail: null,
      consolidatedRecipientEmail: null,
    });
    expect(result.adminRecipientEmail).toBeNull();
    expect(result.consolidatedRecipientEmail).toBeNull();
  });

  it('rejects invalid email address', () => {
    expect(() =>
      v.parse(UpdateTechnicalReportSyncScheduleSchema, {
        ...baseValid,
        adminRecipientEmail: 'not-an-email',
      }),
    ).toThrow();

    expect(() =>
      v.parse(UpdateTechnicalReportSyncScheduleSchema, {
        ...baseValid,
        consolidatedRecipientEmail: 'not-an-email',
      }),
    ).toThrow();
  });
});
