import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  CreateOrderSchema,
  CreateOrderUnitSchema,
  CreateUnitSchema,
  OrderListQuerySchema,
  OrderPricingOverridesSchema,
  OrderPricingOverridesReadSchema,
  OrderServiceTypeSchema,
  RescheduleFailedAppointmentSchema,
  UpdateOrderSchema,
  UpdateUnitSchema,
  canAddOrderItems,
  formatOrderServiceType,
} from './orders.js';
import {
  getMaxUnitYear,
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
} from './validation-limits.js';

const order = {
  clientSheetId: 'CLIENT-DEMO',
  clientNameSnapshot: 'Cliente de prueba',
  scheduledAt: '2026-09-08T18:00:00.000Z',
  serviceType: 'INSTALLATION',
};
const technicianId = '00000000-0000-4000-8000-000000000001';

describe('order contracts', () => {
  it('trims required human-readable order and unit fields before validating and returning them', () => {
    const parsed = v.parse(CreateOrderSchema, {
      ...order,
      clientNameSnapshot: "  Cliente ñ — O'Brien  ",
      technicianId,
      units: [{ label: '  Camión 1  ', makeModel: '  Modelo X  ', serialNumber: '  ab-01  ' }],
    });

    expect(parsed.clientNameSnapshot).toBe("Cliente ñ — O'Brien");
    expect(parsed.units?.[0]).toMatchObject({
      label: 'Camión 1',
      makeModel: 'Modelo X',
      serialNumber: 'ab-01',
    });
    expect(
      v.safeParse(CreateOrderSchema, {
        ...order,
        clientNameSnapshot: '   ',
        technicianId,
      }).success,
    ).toBe(false);
  });

  it('limits new unit labels after trimming while retaining the write schemas only', () => {
    const unit = {
      label: `  ${'x'.repeat(MAX_ORDER_UNIT_LABEL_LENGTH)}  `,
      makeModel: 'M',
      serialNumber: 'S',
    };
    for (const schema of [CreateOrderUnitSchema, CreateUnitSchema, UpdateUnitSchema]) {
      expect(v.safeParse(schema, unit).success).toBe(true);
      expect(
        v.safeParse(schema, { ...unit, label: `x${'x'.repeat(MAX_ORDER_UNIT_LABEL_LENGTH)}` })
          .success,
      ).toBe(false);
    }
    expect(v.parse(CreateUnitSchema, unit).label).toHaveLength(MAX_ORDER_UNIT_LABEL_LENGTH);
    expect(v.parse(CreateUnitSchema, { ...unit, label: '  Truck  12  ' }).label).toBe('Truck  12');
    expect(
      v.safeParse(CreateUnitSchema, {
        ...unit,
        label: `${'😀'.repeat(MAX_ORDER_UNIT_LABEL_LENGTH / 2)}`,
      }).success,
    ).toBe(true);
    expect(v.safeParse(UpdateUnitSchema, { makeModel: 'M' }).success).toBe(true);
  });

  it('limits new unit make/model values to 200 UTF-16 code units after trimming', () => {
    expect(MAX_ORDER_UNIT_MAKE_MODEL_LENGTH).toBe(200);
    for (const schema of [CreateOrderUnitSchema, CreateUnitSchema, UpdateUnitSchema]) {
      const base = schema === UpdateUnitSchema ? {} : { label: 'Unit', serialNumber: 'S' };
      expect(v.parse(schema, { ...base, makeModel: `  ${'x'.repeat(200)}  ` }).makeModel).toBe(
        'x'.repeat(200),
      );
      expect(v.safeParse(schema, { ...base, makeModel: 'x'.repeat(201) }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, makeModel: `${'x'.repeat(198)}😀` }).success).toBe(
        true,
      );
      expect(v.safeParse(schema, { ...base, makeModel: `${'x'.repeat(199)}😀` }).success).toBe(
        false,
      );
    }
  });

  it('limits new serial numbers to 100 UTF-16 code units after trimming without changing case', () => {
    expect(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH).toBe(100);
    for (const schema of [CreateOrderUnitSchema, CreateUnitSchema, UpdateUnitSchema]) {
      const base = schema === UpdateUnitSchema ? {} : { label: 'Unit', makeModel: 'M' };
      expect(v.parse(schema, { ...base, serialNumber: '  Ab-cD  ' }).serialNumber).toBe('Ab-cD');
      expect(v.safeParse(schema, { ...base, serialNumber: 's'.repeat(100) }).success).toBe(true);
      expect(v.safeParse(schema, { ...base, serialNumber: 's'.repeat(101) }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, serialNumber: `${'s'.repeat(98)}😀` }).success).toBe(
        true,
      );
      expect(v.safeParse(schema, { ...base, serialNumber: `${'s'.repeat(99)}😀` }).success).toBe(
        false,
      );
    }
  });

  it('limits new order client-name snapshots to 200 UTF-16 code units after trimming', () => {
    expect(
      v.safeParse(CreateOrderSchema, {
        ...order,
        technicianId,
        clientNameSnapshot: 'a'.repeat(200),
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(CreateOrderSchema, {
        ...order,
        technicianId,
        clientNameSnapshot: 'a'.repeat(201),
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(CreateOrderSchema, {
        ...order,
        technicianId,
        clientNameSnapshot: `${'a'.repeat(198)}😀`,
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(CreateOrderSchema, {
        ...order,
        technicianId,
        clientNameSnapshot: `${'a'.repeat(199)}😀`,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(UpdateOrderSchema, {
        clientNameSnapshot: `${'a'.repeat(200)} `,
        version: 1,
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(UpdateOrderSchema, {
        clientNameSnapshot: `${'a'.repeat(199)}😀`,
        version: 1,
      }).success,
    ).toBe(false);
  });

  it('trims only the outer whitespace of new service addresses and limits them to 500 code units', () => {
    const address = `  ${'a'.repeat(500)}  `;
    expect(
      v.parse(CreateOrderSchema, { ...order, technicianId, serviceAddress: address })
        .serviceAddress,
    ).toBe('a'.repeat(500));
    expect(
      v.safeParse(CreateOrderSchema, { ...order, technicianId, serviceAddress: 'a'.repeat(501) })
        .success,
    ).toBe(false);
    expect(
      v.parse(UpdateOrderSchema, { version: 1, serviceAddress: '  North\n  Dock  ' })
        .serviceAddress,
    ).toBe('North\n  Dock');
    expect(
      v.parse(CreateOrderSchema, { ...order, technicianId, serviceAddress: null }).serviceAddress,
    ).toBeNull();
    expect(v.parse(UpdateOrderSchema, { version: 1 }).serviceAddress).toBeUndefined();
    expect(
      v.parse(UpdateOrderSchema, { version: 1, serviceAddress: null }).serviceAddress,
    ).toBeNull();
  });

  it('trims human-readable fields for partial order and unit updates without changing external identifiers', () => {
    expect(
      v.parse(UpdateOrderSchema, {
        version: 1,
        clientNameSnapshot: '  Cliente  ',
        clientSheetId: '  CLIENT-1  ',
      }),
    ).toMatchObject({ clientNameSnapshot: 'Cliente', clientSheetId: '  CLIENT-1  ' });
    expect(v.parse(UpdateOrderSchema, { version: 1, generalNotes: '  nota  ' }).generalNotes).toBe(
      '  nota  ',
    );
    expect(v.parse(UpdateUnitSchema, { serialNumber: '  ab-01  ' }).serialNumber).toBe('ab-01');
    expect(v.safeParse(UpdateUnitSchema, { label: '   ' }).success).toBe(false);
    expect(
      v.parse(CreateUnitSchema, {
        label: ' L ',
        makeModel: ' M ',
        serialNumber: ' S ',
      }),
    ).toMatchObject({ label: 'L', makeModel: 'M', serialNumber: 'S' });
  });

  it('applies the Hermosillo business-year bound dynamically to unit years', () => {
    const now = new Date('2027-01-01T06:30:00.000Z'); // 2026-12-31 in Hermosillo
    const maxYear = getMaxUnitYear(now);
    const required = { label: 'L', makeModel: 'M', serialNumber: 'S' };
    expect(maxYear).toBe(2027);
    for (const schema of [CreateUnitSchema, CreateOrderUnitSchema, UpdateUnitSchema]) {
      const base = schema === UpdateUnitSchema ? {} : required;
      expect(v.safeParse(schema, { ...base, year: 1900 }).success).toBe(true);
      expect(v.safeParse(schema, { ...base, year: 1899 }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, year: maxYear }).success).toBe(true);
      expect(v.safeParse(schema, { ...base, year: maxYear + 1 }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, year: 2024.5 }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, year: Number.NaN }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, year: Number.POSITIVE_INFINITY }).success).toBe(false);
      expect(v.safeParse(schema, { ...base, year: null }).success).toBe(true);
      expect(v.safeParse(schema, base).success).toBe(true);
    }
    expect(getMaxUnitYear(new Date('2027-01-01T07:30:00.000Z'))).toBe(2028);
  });

  it('limits order creation to 100 units and 500 equipment items across units', () => {
    const units = (count: number, equipmentPerUnit = 0) =>
      Array.from({ length: count }, (_, index) => ({
        label: `Unit ${index}`,
        makeModel: 'Model',
        serialNumber: `serial-${index}`,
        equipment: Array.from({ length: equipmentPerUnit }, (_, equipmentIndex) => ({
          externalKey: `equipment-${index}-${equipmentIndex}`,
        })),
      }));
    const valid = { ...order, technicianId };

    expect(v.safeParse(CreateOrderSchema, { ...valid, units: units(100) }).success).toBe(true);
    expect(v.safeParse(CreateOrderSchema, { ...valid, units: units(101) }).success).toBe(false);
    expect(v.safeParse(CreateOrderSchema, { ...valid, units: units(100, 5) }).success).toBe(true);
    const overEquipmentLimit = units(100, 5);
    overEquipmentLimit[99]!.equipment!.push({ externalKey: 'equipment-500' });
    expect(v.safeParse(CreateOrderSchema, { ...valid, units: overEquipmentLimit }).success).toBe(
      false,
    );
    expect(
      v.safeParse(CreateUnitSchema, {
        label: 'Unit',
        makeModel: 'Model',
        serialNumber: 'serial',
        equipment: Array.from({ length: 500 }, (_, index) => ({ externalKey: `eq-${index}` })),
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(CreateUnitSchema, {
        label: 'Unit',
        makeModel: 'Model',
        serialNumber: 'serial',
        equipment: Array.from({ length: 501 }, (_, index) => ({ externalKey: `eq-${index}` })),
      }).success,
    ).toBe(false);
  });

  it('enforces the shared 5000 UTF-16 code-unit notes limit without changing null or whitespace behavior', async () => {
    const { MAX_ORDER_NOTES_LENGTH } = await import('./validation-limits.js');
    const accepted = '😀'.repeat(MAX_ORDER_NOTES_LENGTH / 2);
    const rejected = `${accepted}😀x`;
    expect(accepted.length).toBe(MAX_ORDER_NOTES_LENGTH);
    expect(
      v.safeParse(CreateOrderSchema, { ...order, technicianId, generalNotes: accepted }).success,
    ).toBe(true);
    expect(
      v.safeParse(CreateOrderSchema, { ...order, technicianId, generalNotes: rejected }).success,
    ).toBe(false);
    expect(v.safeParse(UpdateOrderSchema, { version: 1, generalNotes: rejected }).success).toBe(
      false,
    );
    expect(
      v.parse(CreateOrderSchema, { ...order, technicianId, generalNotes: null }).generalNotes,
    ).toBeNull();
    expect(v.parse(UpdateOrderSchema, { version: 1, generalNotes: '  ' }).generalNotes).toBe('  ');
  });

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

    it.each(['0', '0.00', '99999999.99'])('accepts in-range decimal rate %s', (rate) => {
      expect(
        v.safeParse(OrderPricingOverridesSchema, { rates: { INSTALLATION: rate } }).success,
      ).toBe(true);
    });

    it.each([
      'abc',
      '10.999',
      '-50.00',
      '10,50',
      '',
      '100000000',
      '99999999.991',
      '1e3',
      '4'.repeat(4000),
    ])('rejects invalid rate string %s', (invalidRate) => {
      const result = v.safeParse(OrderPricingOverridesSchema, {
        rates: { INSTALLATION: invalidRate },
      });
      expect(result.success).toBe(false);
    });

    it('continues reading historical rates outside the new write limit', () => {
      const historical = { rates: { INSTALLATION: '123456789.00' } };
      expect(v.parse(OrderPricingOverridesReadSchema, historical)).toEqual(historical);
    });
  });
});

describe('order list query grammar', () => {
  const invalidPages = [
    '1\n',
    '1\r',
    '1\t',
    '١',
    'abc',
    'Infinity',
    '1.5',
    '0',
    '-1',
    '',
    ' ',
    ' 1',
    '1 ',
    '+1',
    '1e3',
    '0x10',
    '9007199254740992',
  ];
  describe.each(['page', 'pageSize'])('%s', (field) => {
    it.each(invalidPages)('rejects %s', (value) => {
      expect(v.safeParse(OrderListQuerySchema, { [field]: value }).success).toBe(false);
    });
  });
  it('preserves optional defaults and numeric output types', () => {
    expect(v.parse(OrderListQuerySchema, {})).toEqual({});
    expect(v.parse(OrderListQuerySchema, { page: '002', pageSize: '100' })).toEqual({
      page: 2,
      pageSize: 100,
    });
  });
  it('rejects pageSize above 100', () => {
    expect(v.safeParse(OrderListQuerySchema, { pageSize: '101' }).success).toBe(false);
  });
  it('rejects unsafe computed offsets including the default pageSize', () => {
    expect(
      v.safeParse(OrderListQuerySchema, { page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' })
        .success,
    ).toBe(false);
    expect(
      v.safeParse(OrderListQuerySchema, { page: String(Number.MAX_SAFE_INTEGER) }).success,
    ).toBe(false);
  });
  it('accepts the verified maximum offset without imposing an Int32 cap', () => {
    expect(v.parse(OrderListQuerySchema, { page: '4294967296', pageSize: '1' })).toEqual({
      page: 4294967296,
      pageSize: 1,
    });
  });
  it.each([
    { page: '4294967297', pageSize: '1' },
    { page: '42949674', pageSize: '100' },
    { page: '171798693' },
    { page: String(Number.MAX_SAFE_INTEGER), pageSize: '1' },
  ])('rejects offsets that Prisma would silently wrap %#', (query) => {
    expect(v.safeParse(OrderListQuerySchema, query).success).toBe(false);
  });

  const invalidDates = [
    'abc',
    '',
    '2026-02-30',
    '2025-02-29',
    '1900-02-29',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-04-31',
    '2026-01-01T12:00:00',
    '2026-01-01T24:00:00Z',
    '2026-01-01T12:60:00Z',
    '2026-01-01T12:00:60Z',
    '2026-01-01T12:00:00.1234Z',
    '2026-01-01T12:00:00+24:00',
    '2026-01-01T12:00:00+01:60',
    '2026-01-01T12:00:00+0100',
    '2026-01-01 ',
  ];
  describe.each(['from', 'to'])('%s date', (field) => {
    it.each(invalidDates)('rejects %s', (value) => {
      expect(v.safeParse(OrderListQuerySchema, { [field]: value }).success).toBe(false);
    });
  });
  it.each([
    '2000-02-29',
    '2024-02-29',
    '2026-01-01T12:00:00Z',
    '2026-01-01T12:00:00.1Z',
    '2026-01-01T12:00:00.12Z',
    '2026-01-01T12:00:00.123-07:00',
  ])('preserves valid date strings %s', (date) => {
    expect(v.parse(OrderListQuerySchema, { from: date, to: date })).toEqual({
      from: date,
      to: date,
    });
  });
  it('compares range instants including explicit timezone offsets', () => {
    expect(
      v.safeParse(OrderListQuerySchema, { from: '2026-01-02', to: '2026-01-01' }).success,
    ).toBe(false);
    expect(
      v.safeParse(OrderListQuerySchema, {
        from: '2026-01-01T00:00:00-07:00',
        to: '2026-01-01T06:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(OrderListQuerySchema, {
        from: '2026-01-01T00:00:00-07:00',
        to: '2026-01-01T07:00:00Z',
      }).success,
    ).toBe(true);
  });
});
