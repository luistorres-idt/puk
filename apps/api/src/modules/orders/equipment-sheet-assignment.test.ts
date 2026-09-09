import { describe, expect, it } from 'vitest';
import { buildEquipmentSheetAssignment } from './equipment-sheet-assignment.js';

const baseInput = {
  clientName: 'Cliente Demo',
  serviceType: 'INSTALLATION' as const,
  unit: {
    label: 'Eco-01',
    makeModel: 'Kenworth T680',
    serialNumber: 'VIN-001',
    year: 2024,
  },
};

const installedValues = {
  J: 'Cliente Demo',
  K: 'INSTALADO',
  L: 'Eco-01',
  M: 'Kenworth T680',
  N: '2024',
  O: 'VIN-001',
};

describe('buildEquipmentSheetAssignment', () => {
  it.each(['INSTALLATION', 'FUEL_SENSOR', 'REVIEW'] as const)(
    'keeps client and vehicle data installed for %s',
    (serviceType) => {
      expect(buildEquipmentSheetAssignment({ ...baseInput, serviceType })).toEqual(installedValues);
    },
  );

  it('returns uninstalled equipment to technician stock and clears vehicle data', () => {
    expect(buildEquipmentSheetAssignment({ ...baseInput, serviceType: 'UNINSTALLATION' })).toEqual({
      K: 'STOCK TECNICO',
      L: '',
      M: '',
      N: '',
      O: '',
    });
  });

  it('moves the old replacement equipment to stock and installs the new one', () => {
    expect(
      buildEquipmentSheetAssignment({
        ...baseInput,
        serviceType: 'EQUIPMENT_REPLACEMENT',
        equipmentServiceStatus: 'INSTALADO',
      }),
    ).toEqual({ K: 'STOCK TECNICO', L: '', M: '', N: '', O: '' });

    expect(
      buildEquipmentSheetAssignment({
        ...baseInput,
        serviceType: 'EQUIPMENT_REPLACEMENT',
        equipmentServiceStatus: 'STOCK TECNICO',
      }),
    ).toEqual(installedValues);
  });

  it('does not change inventory for a failed appointment', () => {
    expect(
      buildEquipmentSheetAssignment({ ...baseInput, serviceType: 'FAILED_APPOINTMENT' }),
    ).toBeNull();
  });
});
