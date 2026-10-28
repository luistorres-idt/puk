import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import {
  RegisterEquipmentSchema,
  initialEquipmentState,
  UpdateInventoryEquipmentSchema,
  DeleteInventoryEquipmentSchema,
} from './inventory.js';
import { AssignEquipmentSchema } from './orders.js';
const input = {
  registrationKey: '11111111-1111-4111-8111-111111111111',
  brand: ' GPS ',
  model: ' Model ',
  imei: ' 012345678901234 ',
  serviceType: 'INSTALLATION',
  clientSheetId: 'C1',
  clientName: 'Client',
};
describe('new inventory registration', () => {
  it('trims fields and preserves IMEI leading zeroes', () => {
    expect(v.parse(RegisterEquipmentSchema, input)).toMatchObject({
      brand: 'GPS',
      model: 'Model',
      imei: '012345678901234',
    });
  });
  it.each(['1234', '0123456789012345', '01234567890123x', '0123456 8901234', ''])(
    'rejects invalid new IMEI %s',
    (imei) => expect(v.safeParse(RegisterEquipmentSchema, { ...input, imei }).success).toBe(false),
  );
  it('requires real installed unit context', () => {
    expect(v.safeParse(RegisterEquipmentSchema, { ...input, serviceType: 'REVIEW' }).success).toBe(
      false,
    );
    expect(
      v.safeParse(RegisterEquipmentSchema, {
        ...input,
        serviceType: 'REVIEW',
        unit: { label: 'Unit', makeModel: 'Model', serialNumber: ' ' },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(RegisterEquipmentSchema, {
        ...input,
        serviceType: 'REVIEW',
        unit: { label: 'Unit', makeModel: 'Model', serialNumber: 'Serial' },
      }).success,
    ).toBe(true);
  });
  it('derives both replacement roles and fuel state', () => {
    expect(initialEquipmentState('EQUIPMENT_REPLACEMENT', 'OLD')).toBe('INSTALLED');
    expect(initialEquipmentState('EQUIPMENT_REPLACEMENT', 'NEW')).toBe('AVAILABLE');
    expect(initialEquipmentState('FUEL_SENSOR')).toBe('AVAILABLE');
    expect(
      v.safeParse(RegisterEquipmentSchema, { ...input, serviceType: 'EQUIPMENT_REPLACEMENT' })
        .success,
    ).toBe(false);
  });
  it('does not impose new IMEI validation on historical assignments', () =>
    expect(
      v.safeParse(AssignEquipmentSchema, { externalKey: 'legacy', imei: 'legacy-IMEI' }).success,
    ).toBe(true));
});

describe('equipment management contracts', () => {
  it('trims editable metadata and requires a positive integer version', () => {
    expect(
      v.parse(UpdateInventoryEquipmentSchema, {
        imei: ' 012345678901234 ',
        brand: ' GPS ',
        model: ' Model ',
        version: 2,
      }),
    ).toEqual({ imei: '012345678901234', brand: 'GPS', model: 'Model', version: 2 });
  });
  it.each([0, -1, 1.5, '1', undefined])('rejects invalid mutation version %s', (version) => {
    expect(
      v.safeParse(UpdateInventoryEquipmentSchema, {
        imei: '012345678901234',
        brand: 'A',
        model: 'B',
        version,
      }).success,
    ).toBe(false);
    expect(v.safeParse(DeleteInventoryEquipmentSchema, { version }).success).toBe(false);
  });
  it.each([' ', 'x'.repeat(201)])('rejects invalid descriptions', (value) => {
    expect(
      v.safeParse(UpdateInventoryEquipmentSchema, {
        imei: '012345678901234',
        brand: value,
        model: 'B',
        version: 1,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(UpdateInventoryEquipmentSchema, {
        imei: '012345678901234',
        brand: 'A',
        model: value,
        version: 1,
      }).success,
    ).toBe(false);
  });
  it.each(['state', 'currentClientSheetId', 'unitLabel'])('rejects immutable field %s', (key) => {
    expect(
      v.safeParse(UpdateInventoryEquipmentSchema, {
        brand: 'A',
        model: 'B',
        imei: '012345678901234',
        version: 1,
        [key]: 'changed',
      }).success,
    ).toBe(false);
  });
  it.each(['1234', '01234567890123x', '0123456789012345', '0123456 8901234'])(
    'rejects invalid edited IMEI %s',
    (imei) =>
      expect(
        v.safeParse(UpdateInventoryEquipmentSchema, {
          imei,
          brand: 'GPS',
          model: 'Model',
          version: 1,
        }).success,
      ).toBe(false),
  );
});
