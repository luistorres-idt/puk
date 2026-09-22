import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ExternalEquipment } from '@puk/contracts';
import type { ConfiguredUnitItem } from './configured-order-unit.js';
import { useManualUnitConfiguration } from './useManualUnitConfiguration.js';

function equipment(externalKey: string): ExternalEquipment {
  return {
    externalKey,
    id: externalKey,
    imei: `IMEI-${externalKey}`,
    brand: 'Teltonika',
    model: 'FMB920',
    line: null,
    iccid: null,
    carrier: null,
    condition: 'NUEVO',
    currentClient: null,
    serviceStatus: 'DISPONIBLE',
    unit: null,
    unitMakeModel: null,
    unitYear: null,
    unitSerialNumber: null,
    serviceType: null,
    rowNumber: 2,
    hasValidIdentity: true,
    rawValues: {},
  };
}

function configuredUnit(overrides: Partial<ConfiguredUnitItem> = {}): ConfiguredUnitItem {
  return {
    id: 'existing-unit',
    serviceType: 'INSTALLATION',
    label: 'Existing unit',
    makeModel: 'Existing model',
    serialNumber: 'SERIAL-1',
    year: 2025,
    equipment: null,
    ...overrides,
  };
}

describe('useManualUnitConfiguration', () => {
  it('requires the label, make/model, and serial number without resetting the form', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>(null);
    const configuration = useManualUnitConfiguration(units, error);
    configuration.unitForm.value = {
      label: 'Truck 12',
      makeModel: ' ',
      serialNumber: 'VIN-12',
      year: 2024,
    };

    configuration.handleAddManualUnit('INSTALLATION');

    expect(error.value).toBe(
      'Por favor completa la etiqueta, marca/modelo y número de serie de la unidad.',
    );
    expect(configuration.unitForm.value.label).toBe('Truck 12');
    expect(units.value).toEqual([]);
  });

  it('rejects duplicate serial numbers after trimming and ignoring case', () => {
    const units = ref([configuredUnit()]);
    const error = ref<string | null>(null);
    const configuration = useManualUnitConfiguration(units, error);
    configuration.unitForm.value = {
      label: 'Truck 12',
      makeModel: 'Freightliner',
      serialNumber: '  serial-1  ',
      year: 2024,
    };

    configuration.handleAddManualUnit('FUEL_SENSOR');

    expect(error.value).toBe('Ya existe una unidad con ese número de serie en la orden.');
    expect(configuration.unitForm.value.serialNumber).toBe('  serial-1  ');
    expect(units.value).toHaveLength(1);
  });

  it('rejects equipment already assigned to another unit without clearing the selection', () => {
    const duplicateEquipment = equipment('EQ-1');
    const units = ref([configuredUnit({ equipment: duplicateEquipment })]);
    const error = ref<string | null>(null);
    const configuration = useManualUnitConfiguration(units, error);
    configuration.unitForm.value = {
      label: 'Truck 12',
      makeModel: 'Freightliner',
      serialNumber: 'VIN-12',
      year: 2024,
    };
    configuration.installationEquipmentKey.value = duplicateEquipment.externalKey;
    configuration.handleInstallationEquipmentSelect(duplicateEquipment);

    configuration.handleAddManualUnit('INSTALLATION');

    expect(error.value).toBe('Ese equipo ya fue asignado a otra unidad en esta orden.');
    expect(configuration.installationEquipmentKey.value).toBe('EQ-1');
    expect(configuration.installationEquipment.value).toEqual(duplicateEquipment);
    expect(units.value).toHaveLength(1);
  });

  it.each([1899, 2101, null])('normalizes an invalid year of %s to null', (year) => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const configuration = useManualUnitConfiguration(units, ref(null), () => 'generated-id');
    configuration.unitForm.value = {
      label: ' Truck 12 ',
      makeModel: ' Freightliner ',
      serialNumber: ' VIN-12 ',
      year,
    };

    configuration.handleAddManualUnit('FUEL_SENSOR');

    expect(units.value[0]).toMatchObject({
      id: 'generated-id',
      serviceType: 'FUEL_SENSOR',
      label: 'Truck 12',
      makeModel: 'Freightliner',
      serialNumber: 'VIN-12',
      year: null,
    });
  });

  it('adds a valid unit with selected equipment and resets state only after success', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>('Previous error');
    const configuration = useManualUnitConfiguration(units, error, () => 'generated-id');
    const selectedEquipment = equipment('EQ-1');
    configuration.unitForm.value = {
      label: ' Truck 12 ',
      makeModel: ' Freightliner ',
      serialNumber: ' VIN-12 ',
      year: 2100,
    };
    configuration.installationEquipmentKey.value = selectedEquipment.externalKey;
    configuration.handleInstallationEquipmentSelect(selectedEquipment);

    configuration.handleAddManualUnit('INSTALLATION');

    expect(units.value).toEqual([
      {
        id: 'generated-id',
        serviceType: 'INSTALLATION',
        label: 'Truck 12',
        makeModel: 'Freightliner',
        serialNumber: 'VIN-12',
        year: 2100,
        equipment: selectedEquipment,
      },
    ]);
    expect(error.value).toBeNull();
    expect(configuration.unitForm.value).toEqual({
      label: '',
      makeModel: '',
      serialNumber: '',
      year: new Date().getFullYear(),
    });
    expect(configuration.installationEquipmentKey.value).toBeNull();
    expect(configuration.installationEquipment.value).toBeNull();
  });
});
