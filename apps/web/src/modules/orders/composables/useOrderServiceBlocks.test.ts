import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { ConfiguredUnitItem } from './configured-order-unit.js';
import { useOrderServiceBlocks } from './useOrderServiceBlocks.js';

function unit(id: string, serviceType: ConfiguredUnitItem['serviceType']): ConfiguredUnitItem {
  return {
    id,
    serviceType,
    label: id,
    makeModel: 'Model',
    serialNumber: `SERIAL-${id}`,
    year: 2025,
    equipment: null,
  };
}

describe('useOrderServiceBlocks', () => {
  it('groups units by service type in first-appearance order while preserving unit order', () => {
    const configuration = useOrderServiceBlocks(ref(null));
    configuration.configuredUnits.value.push(
      unit('review-1', 'REVIEW'),
      unit('installation-1', 'INSTALLATION'),
      unit('review-2', 'REVIEW'),
    );

    expect(configuration.serviceBlocks.value.map((block) => block.serviceType)).toEqual([
      'REVIEW',
      'INSTALLATION',
    ]);
    expect(configuration.serviceBlocks.value[0]?.units.map(({ id }) => id)).toEqual([
      'review-1',
      'review-2',
    ]);
  });

  it('removes only the unit matching the requested id', () => {
    const configuration = useOrderServiceBlocks(ref(null));
    configuration.configuredUnits.value.push(
      unit('keep-1', 'REVIEW'),
      unit('remove', 'INSTALLATION'),
      unit('keep-2', 'INSTALLATION'),
    );

    configuration.removeConfiguredUnit('remove');

    expect(configuration.configuredUnits.value.map(({ id }) => id)).toEqual(['keep-1', 'keep-2']);
  });

  it('removes every unit in the selected service block and keeps other services', () => {
    const configuration = useOrderServiceBlocks(ref(null));
    configuration.configuredUnits.value.push(
      unit('review-1', 'REVIEW'),
      unit('installation', 'INSTALLATION'),
      unit('review-2', 'REVIEW'),
    );

    configuration.removeBlock('REVIEW');

    expect(configuration.configuredUnits.value).toEqual([unit('installation', 'INSTALLATION')]);
  });

  it('selects a service block and clears the current error', () => {
    const error = ref<string | null>('Previous error');
    const configuration = useOrderServiceBlocks(error);

    configuration.selectServiceBlockForAdding('FUEL_SENSOR');

    expect(configuration.activeServiceType.value).toBe('FUEL_SENSOR');
    expect(error.value).toBeNull();
  });

  it('excludes failed appointments and preserves option labels and disabled states', () => {
    const configuration = useOrderServiceBlocks(ref(null));

    expect(configuration.serviceTypeOptions).toEqual([
      { label: 'Instalación', value: 'INSTALLATION', disabled: false },
      { label: 'Revisión', value: 'REVIEW', disabled: false },
      { label: 'Desinstalación', value: 'UNINSTALLATION', disabled: false },
      { label: 'Sensor fuel', value: 'FUEL_SENSOR', disabled: false },
      { label: 'Cambio de equipo', value: 'EQUIPMENT_REPLACEMENT', disabled: false },
    ]);
  });

  it('clears all configured units without replacing the exposed ref', () => {
    const configuration = useOrderServiceBlocks(ref(null));
    const configuredUnitsRef = configuration.configuredUnits;
    configuration.configuredUnits.value.push(unit('installation', 'INSTALLATION'));

    configuration.clearConfiguredUnits();

    expect(configuration.configuredUnits).toBe(configuredUnitsRef);
    expect(configuration.configuredUnits.value).toEqual([]);
  });
});
