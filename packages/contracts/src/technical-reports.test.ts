import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  TechnicalReportExportQuerySchema,
  TechnicalReportQuerySchema,
  UpdateOrderDhlShippingSchema,
} from './technical-reports.js';

describe('technical reports contracts', () => {
  it('parses weekOffset query strings and filters', () => {
    expect(
      v.parse(TechnicalReportQuerySchema, {
        weekOffset: '-2',
        search: ' OS-2026 ',
      }),
    ).toEqual({
      weekOffset: -2,
      search: 'OS-2026',
    });

    expect(v.parse(TechnicalReportExportQuerySchema, { weekOffset: '0' })).toEqual({
      weekOffset: 0,
    });
  });

  it('rejects out-of-range or non-integer week offsets', () => {
    expect(v.safeParse(TechnicalReportQuerySchema, { weekOffset: '1.5' }).success).toBe(false);
    expect(v.safeParse(TechnicalReportQuerySchema, { weekOffset: '-200' }).success).toBe(false);
    expect(v.safeParse(TechnicalReportQuerySchema, { weekOffset: 'abc' }).success).toBe(false);
  });

  it('validates DHL shipping cost values including null and zero', () => {
    expect(v.parse(UpdateOrderDhlShippingSchema, { dhlShippingCost: 280.5 })).toEqual({
      dhlShippingCost: 280.5,
    });
    expect(v.parse(UpdateOrderDhlShippingSchema, { dhlShippingCost: 0 })).toEqual({
      dhlShippingCost: 0,
    });
    expect(v.parse(UpdateOrderDhlShippingSchema, { dhlShippingCost: null })).toEqual({
      dhlShippingCost: null,
    });
    expect(v.safeParse(UpdateOrderDhlShippingSchema, { dhlShippingCost: -10 }).success).toBe(false);
    expect(v.safeParse(UpdateOrderDhlShippingSchema, { dhlShippingCost: 10.123 }).success).toBe(
      false,
    );
  });
});
