import { computed, ref, watch, type Ref } from 'vue';
import {
  ORDER_SERVICE_LABELS,
  isValidUnitYear,
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  OrderServiceTypeSchema,
  isServiceConfigurationSupported,
  type CreateUnit,
  type ExternalEquipment,
  type OrderServiceType,
} from '@puk/contracts';
import { extractUnitFromEquipment, toEquipmentAssignment } from '@/modules/external-catalogs';
import type { OrderDetail } from '../api.js';

interface AddOrderUnitState {
  orderId: string;
  order: Readonly<Ref<OrderDetail | undefined>>;
  canAddItems: Readonly<Ref<boolean>>;
  assignedEquipmentKeys: Readonly<Ref<string[]>>;
  insertUnit: (input: { id: string; data: CreateUnit }) => Promise<unknown>;
  notifyWarning: (message: string) => void;
  notifySuccess: (message: string) => void;
  notifyError: (error: unknown, fallback: string) => void;
}

export function useAddOrderUnit({
  orderId,
  order,
  canAddItems,
  assignedEquipmentKeys,
  insertUnit,
  notifyWarning,
  notifySuccess,
  notifyError,
}: AddOrderUnitState) {
  const showAddUnitModal = ref(false);
  const newUnit = ref({
    label: '',
    makeModel: '',
    serialNumber: '',
    year: 2024 as number | null,
    serviceType: 'INSTALLATION' as OrderServiceType,
  });
  const unitModalEquipmentKey = ref<string | null>(null);
  const unitModalEquipment = ref<ExternalEquipment | null>(null);
  const replacementNewEquipmentKey = ref<string | null>(null);
  const replacementNewEquipment = ref<ExternalEquipment | null>(null);

  const serviceTypeOptions = OrderServiceTypeSchema.options
    .filter((value) => value !== 'FAILED_APPOINTMENT')
    .map((value) => ({
      label: `${ORDER_SERVICE_LABELS[value]}${isServiceConfigurationSupported(value) ? '' : ' (próximamente)'}`,
      value,
      disabled: !isServiceConfigurationSupported(value),
    }));

  const isReviewOrUninstallation = computed(
    () => newUnit.value.serviceType === 'REVIEW' || newUnit.value.serviceType === 'UNINSTALLATION',
  );
  const isEquipmentReplacement = computed(
    () => newUnit.value.serviceType === 'EQUIPMENT_REPLACEMENT',
  );

  const excludeKeysForModalReplacementOld = computed(() => {
    const keys = [...assignedEquipmentKeys.value];
    if (replacementNewEquipmentKey.value) {
      keys.push(replacementNewEquipmentKey.value);
    }
    return keys;
  });

  const excludeKeysForModalReplacementNew = computed(() => {
    const keys = [...assignedEquipmentKeys.value];
    if (unitModalEquipmentKey.value) {
      keys.push(unitModalEquipmentKey.value);
    }
    return keys;
  });

  function handleReplacementNewSelect(eq: ExternalEquipment | null) {
    replacementNewEquipment.value = eq;
  }

  function handleUnitModalEquipmentSelect(eq: ExternalEquipment | null) {
    unitModalEquipment.value = eq;
    if (eq && (isReviewOrUninstallation.value || isEquipmentReplacement.value)) {
      const extracted = extractUnitFromEquipment(eq);
      newUnit.value.label = extracted.label;
      newUnit.value.makeModel = extracted.makeModel;
      newUnit.value.serialNumber = extracted.serialNumber;
      newUnit.value.year = extracted.year;
    }
  }

  watch(
    () => newUnit.value.serviceType,
    (newType) => {
      unitModalEquipmentKey.value = null;
      unitModalEquipment.value = null;
      replacementNewEquipmentKey.value = null;
      replacementNewEquipment.value = null;
      if (
        newType === 'REVIEW' ||
        newType === 'UNINSTALLATION' ||
        newType === 'EQUIPMENT_REPLACEMENT'
      ) {
        newUnit.value.label = '';
        newUnit.value.makeModel = '';
        newUnit.value.serialNumber = '';
        newUnit.value.year = new Date().getFullYear();
      }
    },
  );

  function openAddUnitModal() {
    if (!canAddItems.value) return;
    const defaultService =
      order.value?.serviceType && order.value.serviceType !== 'FAILED_APPOINTMENT'
        ? order.value.serviceType
        : 'INSTALLATION';
    newUnit.value = {
      label: '',
      makeModel: '',
      serialNumber: '',
      year: new Date().getFullYear(),
      serviceType: defaultService as OrderServiceType,
    };
    unitModalEquipmentKey.value = null;
    unitModalEquipment.value = null;
    replacementNewEquipmentKey.value = null;
    replacementNewEquipment.value = null;
    showAddUnitModal.value = true;
  }

  async function handleAddUnit() {
    if (!canAddItems.value) return;
    if (!newUnit.value.label || !newUnit.value.makeModel || !newUnit.value.serialNumber) {
      notifyWarning(
        isReviewOrUninstallation.value || isEquipmentReplacement.value
          ? 'Por favor selecciona un equipo instalado del cliente para autocompletar la unidad.'
          : 'Por favor completa los campos obligatorios de la unidad.',
      );
      return;
    }

    if (newUnit.value.label.trim().length > MAX_ORDER_UNIT_LABEL_LENGTH) {
      notifyWarning(
        `La etiqueta de la unidad no puede superar ${MAX_ORDER_UNIT_LABEL_LENGTH} caracteres.`,
      );
      return;
    }

    if (newUnit.value.makeModel.trim().length > MAX_ORDER_UNIT_MAKE_MODEL_LENGTH) {
      notifyWarning(
        `La marca/modelo de la unidad no puede superar ${MAX_ORDER_UNIT_MAKE_MODEL_LENGTH} caracteres.`,
      );
      return;
    }

    if (newUnit.value.serialNumber.trim().length > MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH) {
      notifyWarning(
        `El número de serie no puede superar ${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH} caracteres.`,
      );
      return;
    }

    if (!isValidUnitYear(newUnit.value.year)) {
      notifyWarning('El año debe ser un entero entre 1900 y el límite vigente.');
      return;
    }

    if (
      isReviewOrUninstallation.value &&
      (!unitModalEquipment.value || !unitModalEquipment.value.hasValidIdentity)
    ) {
      notifyWarning('Debes seleccionar un equipo válido instalado del cliente.');
      return;
    }

    if (isEquipmentReplacement.value) {
      if (!unitModalEquipment.value || !unitModalEquipment.value.hasValidIdentity) {
        notifyWarning('Debes seleccionar el equipo actualmente instalado con el cliente.');
        return;
      }
      if (!replacementNewEquipment.value || !replacementNewEquipment.value.hasValidIdentity) {
        notifyWarning('Debes seleccionar el equipo nuevo de reemplazo (sin instalar de almacén).');
        return;
      }
    }

    try {
      await insertUnit({
        id: orderId,
        data: {
          label: newUnit.value.label.trim(),
          makeModel: newUnit.value.makeModel.trim(),
          serialNumber: newUnit.value.serialNumber.trim(),
          year: newUnit.value.year,
          serviceType: newUnit.value.serviceType,
          equipment: [unitModalEquipment.value, replacementNewEquipment.value]
            .filter((equipment): equipment is ExternalEquipment => Boolean(equipment))
            .map(toEquipmentAssignment),
        },
      });

      showAddUnitModal.value = false;
      unitModalEquipmentKey.value = null;
      unitModalEquipment.value = null;
      replacementNewEquipmentKey.value = null;
      replacementNewEquipment.value = null;
      newUnit.value = {
        label: '',
        makeModel: '',
        serialNumber: '',
        year: new Date().getFullYear(),
        serviceType: 'INSTALLATION',
      };
      notifySuccess('Unidad agregada correctamente.');
    } catch (err) {
      notifyError(err, 'Error al agregar unidad');
    }
  }

  return {
    showAddUnitModal,
    newUnit,
    unitModalEquipmentKey,
    unitModalEquipment,
    isReviewOrUninstallation,
    isEquipmentReplacement,
    replacementNewEquipmentKey,
    replacementNewEquipment,
    excludeKeysForModalReplacementOld,
    excludeKeysForModalReplacementNew,
    serviceTypeOptions,
    handleReplacementNewSelect,
    handleUnitModalEquipmentSelect,
    openAddUnitModal,
    handleAddUnit,
  };
}
