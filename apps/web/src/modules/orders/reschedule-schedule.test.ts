import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisabledScheduleTimes, isPastCalendarDate } from './reschedule-schedule.js';

describe('reschedule schedule constraints', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 14, 35));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables calendar dates before today but keeps today selectable', () => {
    expect(isPastCalendarDate(new Date(2026, 8, 10, 23, 59).getTime())).toBe(true);
    expect(isPastCalendarDate(new Date(2026, 8, 11, 0, 0).getTime())).toBe(false);
    expect(isPastCalendarDate(new Date(2026, 8, 12, 0, 0).getTime())).toBe(false);
  });

  it('disables elapsed hours and minutes when today is selected', () => {
    const validators = getDisabledScheduleTimes(new Date(2026, 8, 11).getTime());

    expect(validators.isHourDisabled?.(13)).toBe(true);
    expect(validators.isHourDisabled?.(14)).toBe(false);
    expect(validators.isMinuteDisabled?.(35, 14)).toBe(true);
    expect(validators.isMinuteDisabled?.(36, 14)).toBe(false);
  });

  it('does not restrict times on a future date', () => {
    expect(getDisabledScheduleTimes(new Date(2026, 8, 12).getTime())).toEqual({});
  });
});
