import { describe, expect, it } from 'vitest';

import { calculateTechnicalReportSyncAt } from './technical-report-sync-schedule.js';

const defaults = {
  cutoffWeekday: 2,
  syncTime: '17:00',
  syncWeekday: 3,
  timeZone: 'America/Hermosillo',
};

describe('calculateTechnicalReportSyncAt', () => {
  it('includes an order closed before the Tuesday cutoff in the current batch', () => {
    const result = calculateTechnicalReportSyncAt(new Date('2026-09-08T23:00:00.000Z'), defaults);
    expect(result.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('moves an order closed after the Tuesday cutoff to the following week', () => {
    const result = calculateTechnicalReportSyncAt(new Date('2026-09-09T07:00:00.000Z'), defaults);
    expect(result.toISOString()).toBe('2026-09-17T00:00:00.000Z');
  });

  it('supports a configurable cutoff and synchronization day', () => {
    const result = calculateTechnicalReportSyncAt(new Date('2026-09-11T18:00:00.000Z'), {
      cutoffWeekday: 5,
      syncTime: '08:30',
      syncWeekday: 1,
      timeZone: 'America/Hermosillo',
    });
    expect(result.toISOString()).toBe('2026-09-14T15:30:00.000Z');
  });
});
