import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  type ExternalEquipment,
} from '@puk/contracts';
import type { ConfiguredUnitItem } from './configured-order-unit.js';
import { useEquipmentReplacementConfiguration } from './useEquipmentReplacementConfiguration.js';

function equipment(externalKey: string, overrides: Partial<ExternalEquipment> = {}) {
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
    ...overrides,
  } satisfies ExternalEquipment;
}

function configuredUnit(
  primary: ExternalEquipment,
  replacement: ExternalEquipment | null = null,
): ConfiguredUnitItem {
  return {
    id: `unit-${primary.externalKey}`,
    serviceType: 'INSTALLATION',
    label: 'Unit',
    makeModel: 'Model',
    serialNumber: 'Serial',
    year: 2025,
    equipment: primary,
    replacementEquipment: replacement,
  };
}

describe('useEquipmentReplacementConfiguration', () => {
  it('requires both equipment selections', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>(null);
    const configuration = useEquipmentReplacementConfiguration(units, error);

    configuration.handleAddEquipmentReplacement();

    expect(error.value).toBe('Selecciona el equipo instalado y el equipo nuevo de reemplazo.');
    expect(units.value).toEqual([]);
  });

  it('excludes assigned equipment and prevents selecting the same equipment on both sides', () => {
    const units = ref([configuredUnit(equipment('ASSIGNED'), equipment('REPLACEMENT'))]);
    const configuration = useEquipmentReplacementConfiguration(units, ref(null));

    configuration.replacementNewEquipmentKey.value = 'NEW';
    expect(configuration.excludeKeysForReplacementOld.value).toEqual([
      'ASSIGNED',
      'REPLACEMENT',
      'NEW',
    ]);

    configuration.replacementOldEquipmentKey.value = 'OLD';
    expect(configuration.excludeKeysForReplacementNew.value).toEqual([
      'ASSIGNED',
      'REPLACEMENT',
      'OLD',
    ]);
  });

  it('rejects an installed equipment already used as replacement without clearing selections', () => {
    const duplicate = equipment('DUPLICATE');
    const units = ref([configuredUnit(equipment('ASSIGNED'), duplicate)]);
    const error = ref<string | null>(null);
    const configuration = useEquipmentReplacementConfiguration(units, error);
    const newEquipment = equipment('NEW');

    configuration.replacementOldEquipmentKey.value = duplicate.externalKey;
    configuration.replacementNewEquipmentKey.value = newEquipment.externalKey;
    configuration.handleReplacementOldSelect(duplicate);
    configuration.handleReplacementNewSelect(newEquipment);
    configuration.handleAddEquipmentReplacement();

    expect(error.value).toBe('El equipo instalado DUPLICATE ya fue agregado a la orden.');
    expect(configuration.replacementOldEquipment.value?.externalKey).toBe('DUPLICATE');
    expect(configuration.replacementNewEquipment.value?.externalKey).toBe('NEW');
    expect(units.value).toHaveLength(1);
  });

  it('rejects replacement equipment already used as primary without clearing selections', () => {
    const duplicate = equipment('DUPLICATE');
    const units = ref([configuredUnit(duplicate)]);
    const error = ref<string | null>(null);
    const configuration = useEquipmentReplacementConfiguration(units, error);
    const oldEquipment = equipment('OLD');

    configuration.handleReplacementOldSelect(oldEquipment);
    configuration.handleReplacementNewSelect(duplicate);
    configuration.handleAddEquipmentReplacement();

    expect(error.value).toBe(
      'El equipo de reemplazo DUPLICATE ya fue seleccionado en otra unidad.',
    );
    expect(configuration.replacementOldEquipment.value?.externalKey).toBe('OLD');
    expect(configuration.replacementNewEquipment.value?.externalKey).toBe('DUPLICATE');
  });

  it('adds an equipment replacement from the installed unit and resets both selectors', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>('Previous error');
    const configuration = useEquipmentReplacementConfiguration(units, error, () => 'generated-id');
    const oldEquipment = equipment('OLD', {
      unit: 'Truck 12',
      unitMakeModel: 'Freightliner Cascadia',
      unitSerialNumber: 'VIN-12',
      unitYear: '2024',
    });
    const newEquipment = equipment('NEW');

    configuration.replacementOldEquipmentKey.value = oldEquipment.externalKey;
    configuration.replacementNewEquipmentKey.value = newEquipment.externalKey;
    configuration.handleReplacementOldSelect(oldEquipment);
    configuration.handleReplacementNewSelect(newEquipment);
    configuration.handleAddEquipmentReplacement();

    expect(units.value).toEqual([
      expect.objectContaining({
        id: 'generated-id',
        serviceType: 'EQUIPMENT_REPLACEMENT',
        label: 'Truck 12',
        makeModel: 'Freightliner Cascadia',
        serialNumber: 'VIN-12',
        year: 2024,
        equipment: oldEquipment,
        replacementEquipment: newEquipment,
      }),
    ]);
    expect(error.value).toBeNull();
    expect(configuration.replacementOldEquipmentKey.value).toBeNull();
    expect(configuration.replacementOldEquipment.value).toBeNull();
    expect(configuration.replacementNewEquipmentKey.value).toBeNull();
    expect(configuration.replacementNewEquipment.value).toBeNull();
  });

  it('rejects an equipment-derived overlong label and preserves both selections', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>(null);
    const configuration = useEquipmentReplacementConfiguration(units, error);
    const oldEquipment = equipment('OLD', { unit: 'x'.repeat(MAX_ORDER_UNIT_LABEL_LENGTH + 1) });
    const newEquipment = equipment('NEW');
    configuration.replacementOldEquipmentKey.value = oldEquipment.externalKey;
    configuration.replacementNewEquipmentKey.value = newEquipment.externalKey;
    configuration.handleReplacementOldSelect(oldEquipment);
    configuration.handleReplacementNewSelect(newEquipment);

    configuration.handleAddEquipmentReplacement();

    expect(error.value).toContain(`${MAX_ORDER_UNIT_LABEL_LENGTH}`);
    expect(units.value).toEqual([]);
    expect(configuration.replacementOldEquipment.value).toEqual(oldEquipment);
    expect(configuration.replacementNewEquipment.value).toEqual(newEquipment);
  });

  it('rejects an equipment-derived overlong serial and preserves both selections', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>(null);
    const configuration = useEquipmentReplacementConfiguration(units, error);
    const oldEquipment = equipment('OLD', {
      unitSerialNumber: 's'.repeat(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH + 1),
    });
    const newEquipment = equipment('NEW');
    configuration.replacementOldEquipmentKey.value = oldEquipment.externalKey;
    configuration.replacementNewEquipmentKey.value = newEquipment.externalKey;
    configuration.handleReplacementOldSelect(oldEquipment);
    configuration.handleReplacementNewSelect(newEquipment);

    configuration.handleAddEquipmentReplacement();

    expect(error.value).toContain(`${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH}`);
    expect(units.value).toEqual([]);
    expect(configuration.replacementOldEquipment.value).toEqual(oldEquipment);
    expect(configuration.replacementNewEquipment.value).toEqual(newEquipment);
  });
});
