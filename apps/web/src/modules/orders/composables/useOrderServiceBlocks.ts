import { computed, ref, type Ref } from 'vue';
import {
  ORDER_SERVICE_LABELS,
  OrderServiceTypeSchema,
  isServiceConfigurationSupported,
  type OrderServiceType,
} from '@puk/contracts';
import type { ConfiguredUnitItem } from './configured-order-unit.js';

export interface ServiceBlock {
  serviceType: OrderServiceType;
  label: string;
  units: ConfiguredUnitItem[];
}

export function useOrderServiceBlocks(error: Ref<string | null>) {
  const configuredUnits = ref<ConfiguredUnitItem[]>([]);
  const activeServiceType = ref<OrderServiceType>('INSTALLATION');

  const serviceBlocks = computed<ServiceBlock[]>(() => {
    const blocksByServiceType = new Map<OrderServiceType, ConfiguredUnitItem[]>();

    for (const unit of configuredUnits.value) {
      const units = blocksByServiceType.get(unit.serviceType) ?? [];
      units.push(unit);
      blocksByServiceType.set(unit.serviceType, units);
    }

    return Array.from(blocksByServiceType, ([serviceType, units]) => ({
      serviceType,
      label: ORDER_SERVICE_LABELS[serviceType] ?? serviceType,
      units,
    }));
  });

  const serviceTypeOptions = OrderServiceTypeSchema.options
    .filter((value) => value !== 'FAILED_APPOINTMENT')
    .map((value) => ({
      label: `${ORDER_SERVICE_LABELS[value]}${isServiceConfigurationSupported(value) ? '' : ' (próximamente)'}`,
      value,
      disabled: !isServiceConfigurationSupported(value),
    }));

  function removeConfiguredUnit(unitId: string) {
    const index = configuredUnits.value.findIndex((unit) => unit.id === unitId);
    if (index >= 0) {
      configuredUnits.value.splice(index, 1);
    }
  }

  function removeBlock(serviceType: OrderServiceType) {
    configuredUnits.value = configuredUnits.value.filter(
      (unit) => unit.serviceType !== serviceType,
    );
  }

  function selectServiceBlockForAdding(serviceType: OrderServiceType) {
    activeServiceType.value = serviceType;
    error.value = null;
  }

  function clearConfiguredUnits() {
    configuredUnits.value = [];
  }

  return {
    activeServiceType,
    clearConfiguredUnits,
    configuredUnits,
    removeBlock,
    removeConfiguredUnit,
    selectServiceBlockForAdding,
    serviceBlocks,
    serviceTypeOptions,
  };
}
