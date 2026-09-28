import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  CreateOrderSchema,
  OrderListQuerySchema,
  OrderPricingOverridesSchema,
  OrderServiceTypeSchema,
  RescheduleFailedAppointmentSchema,
  UpdateOrderSchema,
  canAddOrderItems,
  formatOrderServiceType,
} from './orders.js';

const order = {
  clientSheetId: 'CLIENT-DEMO',
  clientNameSnapshot: 'Cliente de prueba',
  scheduledAt: '2026-09-08T18:00:00.000Z',
  serviceType: 'INSTALLATION',
};
const technicianId = '00000000-0000-4000-8000-000000000001';

describe('order contracts', () => {
  it.each([undefined, null, '', 'not-a-uuid'])('rejects technicianId %s', (value) => {
    const result = v.safeParse(CreateOrderSchema, { ...order, technicianId: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.path?.[0]?.key).toBe('technicianId');
    }
  });

  it('requires a technician from the first draft and prevents removing it on update', () => {
    expect(v.parse(CreateOrderSchema, { ...order, technicianId }).technicianId).toBe(technicianId);
    expect(v.safeParse(UpdateOrderSchema, { version: 1, technicianId: null }).success).toBe(false);
    expect(v.safeParse(UpdateOrderSchema, { version: 1, generalNotes: 'Nota' }).success).toBe(true);
  });

  it('validates failed appointment rescheduling input', () => {
    expect(
      v.parse(RescheduleFailedAppointmentSchema, {
        scheduledAt: '2099-09-15T18:00:00.000Z',
        version: 4,
      }),
    ).toEqual({ scheduledAt: '2099-09-15T18:00:00.000Z', version: 4 });
    expect(
      v.safeParse(RescheduleFailedAppointmentSchema, {
        scheduledAt: 'not-a-date',
        version: 0,
      }).success,
    ).toBe(false);
  });

  it.each(OrderServiceTypeSchema.options)('recognizes and filters %s', (serviceType) => {
    expect(v.parse(CreateOrderSchema, { ...order, serviceType, technicianId }).serviceType).toBe(
      serviceType,
    );
    expect(v.parse(OrderListQuerySchema, { serviceType }).serviceType).toBe(serviceType);
    expect(formatOrderServiceType(serviceType)).not.toBe(serviceType);
  });

  it.each(OrderServiceTypeSchema.options)(
    'allows additions to all draft orders: %s',
    (serviceType) => {
      expect(canAddOrderItems({ status: 'DRAFT', serviceType })).toBe(true);
      expect(canAddOrderItems({ status: 'ASSIGNED', serviceType })).toBe(false);
      expect(canAddOrderItems({ status: 'REQUIRES_CORRECTION', serviceType })).toBe(false);
    },
  );

  it('formats new services consistently while preserving historical unknown labels', () => {
    expect(formatOrderServiceType('FUEL_SENSOR')).toBe('Sensor fuel');
    expect(formatOrderServiceType('EQUIPMENT_REPLACEMENT')).toBe('Cambio de equipo');
    expect(formatOrderServiceType('HISTORICAL')).toBe('HISTORICAL');
    expect(formatOrderServiceType(null)).toBe('');
  });

  describe('OrderPricingOverridesSchema', () => {
    it('accepts valid overrides for rates and travel expenses', () => {
      const valid = {
        rates: {
          INSTALLATION: '650.00',
          REVIEW: '300.5',
          FUEL_SENSOR: '400',
        },
        travelExpenses: '450.00',
        departureCost: '450.00',
        reason: 'Tarifa especial fin de semana',
      };
      const parsed = v.parse(OrderPricingOverridesSchema, valid);
      expect(parsed).toEqual(valid);
    });

    it('accepts empty/partial overrides', () => {
      const parsed = v.parse(OrderPricingOverridesSchema, {});
      expect(parsed).toEqual({});
    });

    it.each(['abc', '10.999', '-50.00', '10,50', ''])(
      'rejects invalid rate string %s',
      (invalidRate) => {
        const result = v.safeParse(OrderPricingOverridesSchema, {
          rates: { INSTALLATION: invalidRate },
        });
        expect(result.success).toBe(false);
      },
    );
  });
});
