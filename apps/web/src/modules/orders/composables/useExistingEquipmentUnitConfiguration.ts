import { ref, type Ref } from 'vue';
import {
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  type ExternalEquipment,
  type OrderServiceType,
} from '@puk/contracts';
import { generateUuid } from '@/shared/utils/uuid.js';
import { extractUnitFromEquipment } from '../../external-catalogs/index.js';
import type { ConfiguredUnitItem } from './configured-order-unit.js';

export function useExistingEquipmentUnitConfiguration(
  configuredUnits: Ref<ConfiguredUnitItem[]>,
  error: Ref<string | null>,
  generateId: () => string = generateUuid,
) {
  const reviewSelectedEquipmentKey = ref<string | null>(null);
  const reviewSelectedEquipment = ref<ExternalEquipment | null>(null);

  function handleReviewEquipmentSelect(equipment: ExternalEquipment | null) {
    reviewSelectedEquipment.value = equipment;
  }

  function handleAddReviewEquipment(targetServiceType: OrderServiceType) {
    if (!reviewSelectedEquipment.value) return;

    const equipment = reviewSelectedEquipment.value;
    if (
      configuredUnits.value.some((unit) => unit.equipment?.externalKey === equipment.externalKey)
    ) {
      error.value = `El equipo ${equipment.externalKey} ya fue agregado a la orden.`;
      return;
    }

    error.value = null;
    const extracted = extractUnitFromEquipment(equipment);
    if (extracted.label.trim().length > MAX_ORDER_UNIT_LABEL_LENGTH) {
      error.value = `La etiqueta de la unidad no puede superar ${MAX_ORDER_UNIT_LABEL_LENGTH} caracteres.`;
      return;
    }
    if (extracted.serialNumber.trim().length > MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH) {
      error.value = `El número de serie no puede superar ${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH} caracteres.`;
      return;
    }
    configuredUnits.value.push({
      id: generateId(),
      serviceType: targetServiceType,
      label: extracted.label,
      makeModel: extracted.makeModel,
      serialNumber: extracted.serialNumber,
      year: extracted.year,
      equipment,
    });

    reviewSelectedEquipmentKey.value = null;
    reviewSelectedEquipment.value = null;
  }

  return {
    handleAddReviewEquipment,
    handleReviewEquipmentSelect,
    reviewSelectedEquipment,
    reviewSelectedEquipmentKey,
  };
}
