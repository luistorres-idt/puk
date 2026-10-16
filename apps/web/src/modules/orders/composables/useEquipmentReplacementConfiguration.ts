import { computed, ref, type Ref } from 'vue';
import {
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  type ExternalEquipment,
} from '@puk/contracts';
import { generateUuid } from '@/shared/utils/uuid.js';
import { extractUnitFromEquipment } from '../../external-catalogs/index.js';
import type { ConfiguredUnitItem } from './configured-order-unit.js';

export function useEquipmentReplacementConfiguration(
  configuredUnits: Ref<ConfiguredUnitItem[]>,
  error: Ref<string | null>,
  generateId: () => string = generateUuid,
) {
  const replacementOldEquipmentKey = ref<string | null>(null);
  const replacementOldEquipment = ref<ExternalEquipment | null>(null);
  const replacementNewEquipmentKey = ref<string | null>(null);
  const replacementNewEquipment = ref<ExternalEquipment | null>(null);

  const assignedEquipmentKeys = computed<string[]>(() => {
    const keys: string[] = [];
    for (const unit of configuredUnits.value) {
      if (unit.equipment?.externalKey) {
        keys.push(unit.equipment.externalKey);
      }
      if (unit.replacementEquipment?.externalKey) {
        keys.push(unit.replacementEquipment.externalKey);
      }
    }
    return keys;
  });

  const excludeKeysForReplacementOld = computed(() => {
    const keys = [...assignedEquipmentKeys.value];
    if (replacementNewEquipmentKey.value) {
      keys.push(replacementNewEquipmentKey.value);
    }
    return keys;
  });

  const excludeKeysForReplacementNew = computed(() => {
    const keys = [...assignedEquipmentKeys.value];
    if (replacementOldEquipmentKey.value) {
      keys.push(replacementOldEquipmentKey.value);
    }
    return keys;
  });

  function handleReplacementOldSelect(equipment: ExternalEquipment | null) {
    replacementOldEquipment.value = equipment;
  }

  function handleReplacementNewSelect(equipment: ExternalEquipment | null) {
    replacementNewEquipment.value = equipment;
  }

  function handleAddEquipmentReplacement() {
    if (!replacementOldEquipment.value || !replacementNewEquipment.value) {
      error.value = 'Selecciona el equipo instalado y el equipo nuevo de reemplazo.';
      return;
    }

    const oldEquipment = replacementOldEquipment.value;
    const newEquipment = replacementNewEquipment.value;

    if (
      configuredUnits.value.some(
        (unit) =>
          unit.equipment?.externalKey === oldEquipment.externalKey ||
          unit.replacementEquipment?.externalKey === oldEquipment.externalKey,
      )
    ) {
      error.value = `El equipo instalado ${oldEquipment.externalKey} ya fue agregado a la orden.`;
      return;
    }

    if (
      configuredUnits.value.some(
        (unit) =>
          unit.replacementEquipment?.externalKey === newEquipment.externalKey ||
          unit.equipment?.externalKey === newEquipment.externalKey,
      )
    ) {
      error.value = `El equipo de reemplazo ${newEquipment.externalKey} ya fue seleccionado en otra unidad.`;
      return;
    }

    error.value = null;
    const extracted = extractUnitFromEquipment(oldEquipment);
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
      serviceType: 'EQUIPMENT_REPLACEMENT',
      label: extracted.label,
      makeModel: extracted.makeModel,
      serialNumber: extracted.serialNumber,
      year: extracted.year,
      equipment: oldEquipment,
      replacementEquipment: newEquipment,
    });

    replacementOldEquipmentKey.value = null;
    replacementOldEquipment.value = null;
    replacementNewEquipmentKey.value = null;
    replacementNewEquipment.value = null;
  }

  return {
    assignedEquipmentKeys,
    excludeKeysForReplacementNew,
    excludeKeysForReplacementOld,
    handleAddEquipmentReplacement,
    handleReplacementNewSelect,
    handleReplacementOldSelect,
    replacementNewEquipment,
    replacementNewEquipmentKey,
    replacementOldEquipment,
    replacementOldEquipmentKey,
  };
}
