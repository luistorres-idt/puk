import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  type ExternalEquipment,
} from '@puk/contracts';
import type { ConfiguredUnitItem } from './configured-order-unit.js';
import { useExistingEquipmentUnitConfiguration } from './useExistingEquipmentUnitConfiguration.js';

function equipment(
  externalKey: string,
  overrides: Partial<ExternalEquipment> = {},
): ExternalEquipment {
  return {
    externalKey,
    id: externalKey,
    imei: `IMEI-${externalKey}`,
    brand: 'Teltonika',
    model: 'FMB920',
    line: null,
    iccid: null,
    carrier: null,
    condition: 'USADO',
    currentClient: 'Acme',
    serviceStatus: 'INSTALADO',
    unit: 'Truck 12',
    unitMakeModel: 'Freightliner Cascadia',
    unitYear: '2024',
    unitSerialNumber: 'VIN-12',
    serviceType: null,
    rowNumber: 2,
    hasValidIdentity: true,
    rawValues: {},
    ...overrides,
  };
}

function configuredUnit(selectedEquipment: ExternalEquipment): ConfiguredUnitItem {
  return {
    id: 'existing-unit',
    serviceType: 'REVIEW',
    label: 'Existing unit',
    makeModel: 'Existing model',
    serialNumber: 'SERIAL-1',
    year: 2025,
    equipment: selectedEquipment,
  };
}

describe('useExistingEquipmentUnitConfiguration', () => {
  it('returns without changing an existing error when no equipment is selected', () => {
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>('Previous error');
    const configuration = useExistingEquipmentUnitConfiguration(units, error);

    configuration.handleAddReviewEquipment('REVIEW');

    expect(error.value).toBe('Previous error');
    expect(units.value).toEqual([]);
  });

  it('rejects an equipment-derived overlong unit label and retains the selected equipment', () => {
    const selectedEquipment = equipment('EQ-LONG', {
      unit: 'x'.repeat(MAX_ORDER_UNIT_LABEL_LENGTH + 1),
    });
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>(null);
    const configuration = useExistingEquipmentUnitConfiguration(units, error);
    configuration.reviewSelectedEquipmentKey.value = selectedEquipment.externalKey;
    configuration.handleReviewEquipmentSelect(selectedEquipment);

    configuration.handleAddReviewEquipment('REVIEW');

    expect(error.value).toContain(`${MAX_ORDER_UNIT_LABEL_LENGTH}`);
    expect(units.value).toEqual([]);
    expect(configuration.reviewSelectedEquipmentKey.value).toBe(selectedEquipment.externalKey);
    expect(configuration.reviewSelectedEquipment.value).toEqual(selectedEquipment);
  });

  it('rejects an equipment-derived overlong serial number and retains the selection', () => {
    const selectedEquipment = equipment('EQ-LONG-SERIAL', {
      unitSerialNumber: 's'.repeat(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH + 1),
    });
    const units = ref<ConfiguredUnitItem[]>([]);
    const error = ref<string | null>(null);
    const configuration = useExistingEquipmentUnitConfiguration(units, error);
    configuration.reviewSelectedEquipmentKey.value = selectedEquipment.externalKey;
    configuration.handleReviewEquipmentSelect(selectedEquipment);

    configuration.handleAddReviewEquipment('REVIEW');

    expect(error.value).toContain(`${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH}`);
    expect(units.value).toEqual([]);
    expect(configuration.reviewSelectedEquipment.value).toEqual(selectedEquipment);
  });

  it('updates the selected equipment through the select handler', () => {
    const configuration = useExistingEquipmentUnitConfiguration(
      ref<ConfiguredUnitItem[]>([]),
      ref(null),
    );
    const selectedEquipment = equipment('EQ-1');

    configuration.handleReviewEquipmentSelect(selectedEquipment);

    expect(configuration.reviewSelectedEquipment.value).toEqual(selectedEquipment);
  });

  it('rejects duplicate equipment and preserves the selection', () => {
    const selectedEquipment = equipment('EQ-1');
    const units = ref([configuredUnit(selectedEquipment)]);
    const error = ref<string | null>(null);
    const configuration = useExistingEquipmentUnitConfiguration(units, error);
    configuration.reviewSelectedEquipmentKey.value = selectedEquipment.externalKey;
    configuration.handleReviewEquipmentSelect(selectedEquipment);

    configuration.handleAddReviewEquipment('UNINSTALLATION');

    expect(error.value).toBe('El equipo EQ-1 ya fue agregado a la orden.');
    expect(configuration.reviewSelectedEquipmentKey.value).toBe('EQ-1');
    expect(configuration.reviewSelectedEquipment.value).toEqual(selectedEquipment);
    expect(units.value).toHaveLength(1);
  });

  it.each(['REVIEW', 'UNINSTALLATION'] as const)(
    'adds extracted equipment data for %s and clears state after success',
    (serviceType) => {
      const units = ref<ConfiguredUnitItem[]>([]);
      const error = ref<string | null>('Previous error');
      const configuration = useExistingEquipmentUnitConfiguration(
        units,
        error,
        () => 'generated-id',
      );
      const selectedEquipment = equipment('EQ-1');
      configuration.reviewSelectedEquipmentKey.value = selectedEquipment.externalKey;
      configuration.handleReviewEquipmentSelect(selectedEquipment);

      configuration.handleAddReviewEquipment(serviceType);

      expect(units.value).toEqual([
        {
          id: 'generated-id',
          serviceType,
          label: 'Truck 12',
          makeModel: 'Freightliner Cascadia',
          serialNumber: 'VIN-12',
          year: 2024,
          equipment: selectedEquipment,
        },
      ]);
      expect(error.value).toBeNull();
      expect(configuration.reviewSelectedEquipmentKey.value).toBeNull();
      expect(configuration.reviewSelectedEquipment.value).toBeNull();
    },
  );
});
