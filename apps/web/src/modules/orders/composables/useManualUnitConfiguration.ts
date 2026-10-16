import { ref, type Ref } from 'vue';
import {
  isValidUnitYear,
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  type ExternalEquipment,
  type OrderServiceType,
} from '@puk/contracts';
import { generateUuid } from '@/shared/utils/uuid.js';
import type { ConfiguredUnitItem } from './configured-order-unit.js';

export function useManualUnitConfiguration(
  configuredUnits: Ref<ConfiguredUnitItem[]>,
  error: Ref<string | null>,
  generateId: () => string = generateUuid,
) {
  const unitForm = ref({
    label: '',
    makeModel: '',
    serialNumber: '',
    year: new Date().getFullYear() as number | null,
  });
  const installationEquipmentKey = ref<string | null>(null);
  const installationEquipment = ref<ExternalEquipment | null>(null);

  function handleInstallationEquipmentSelect(equipment: ExternalEquipment | null) {
    installationEquipment.value = equipment;
  }

  function handleAddManualUnit(targetServiceType: OrderServiceType) {
    const { label, makeModel, serialNumber, year } = unitForm.value;
    if (!label.trim() || !makeModel.trim() || !serialNumber.trim()) {
      error.value = 'Por favor completa la etiqueta, marca/modelo y número de serie de la unidad.';
      return;
    }

    if (label.trim().length > MAX_ORDER_UNIT_LABEL_LENGTH) {
      error.value = `La etiqueta de la unidad no puede superar ${MAX_ORDER_UNIT_LABEL_LENGTH} caracteres.`;
      return;
    }

    if (makeModel.trim().length > MAX_ORDER_UNIT_MAKE_MODEL_LENGTH) {
      error.value = `La marca/modelo de la unidad no puede superar ${MAX_ORDER_UNIT_MAKE_MODEL_LENGTH} caracteres.`;
      return;
    }

    if (serialNumber.trim().length > MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH) {
      error.value = `El número de serie no puede superar ${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH} caracteres.`;
      return;
    }

    if (!isValidUnitYear(year)) {
      error.value = 'El año debe ser un entero entre 1900 y el límite vigente.';
      return;
    }

    if (
      configuredUnits.value.some(
        (unit) => unit.serialNumber.trim().toLowerCase() === serialNumber.trim().toLowerCase(),
      )
    ) {
      error.value = 'Ya existe una unidad con ese número de serie en la orden.';
      return;
    }

    if (
      installationEquipment.value &&
      configuredUnits.value.some(
        (unit) => unit.equipment?.externalKey === installationEquipment.value?.externalKey,
      )
    ) {
      error.value = 'Ese equipo ya fue asignado a otra unidad en esta orden.';
      return;
    }

    error.value = null;
    configuredUnits.value.push({
      id: generateId(),
      serviceType: targetServiceType,
      label: label.trim(),
      makeModel: makeModel.trim(),
      serialNumber: serialNumber.trim(),
      year,
      equipment: installationEquipment.value,
    });

    unitForm.value = {
      label: '',
      makeModel: '',
      serialNumber: '',
      year: new Date().getFullYear(),
    };
    installationEquipmentKey.value = null;
    installationEquipment.value = null;
  }

  return {
    handleAddManualUnit,
    handleInstallationEquipmentSelect,
    installationEquipment,
    installationEquipmentKey,
    unitForm,
  };
}
