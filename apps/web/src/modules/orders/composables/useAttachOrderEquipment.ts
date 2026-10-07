import { computed, ref, type Ref } from 'vue';
import type { AssignEquipment, ExternalEquipment } from '@puk/contracts';
import { toEquipmentAssignment } from '../../external-catalogs/index.js';
import type { OrderDetail } from '../api.js';

interface AttachOrderEquipmentOptions {
  orderId: string;
  order: Readonly<Ref<OrderDetail | undefined>>;
  canAddItems: Readonly<Ref<boolean>>;
  attachEquipment: (input: {
    id: string;
    unitId: string;
    data: AssignEquipment;
  }) => Promise<unknown>;
  notifySuccess: (message: string) => void;
  notifyError: (error: unknown, fallback: string) => void;
}

export function useAttachOrderEquipment({
  orderId,
  order,
  canAddItems,
  attachEquipment,
  notifySuccess,
  notifyError,
}: AttachOrderEquipmentOptions) {
  const showModal = ref(false);
  const targetUnitId = ref<string | null>(null);
  const targetUnit = computed(() =>
    order.value?.units?.find((unit) => unit.id === targetUnitId.value),
  );
  const selectedEquipmentKey = ref<string | null>(null);
  const selectedEquipment = ref<ExternalEquipment | null>(null);

  function openAddEquipment(unitId: string) {
    if (!canAddItems.value) return;
    targetUnitId.value = unitId;
    selectedEquipmentKey.value = null;
    selectedEquipment.value = null;
    showModal.value = true;
  }

  function handleEquipmentSelect(equipment: ExternalEquipment | null) {
    selectedEquipment.value = equipment;
  }

  async function handleAddEquipment() {
    if (!canAddItems.value) return;
    if (!targetUnitId.value || !selectedEquipment.value || !selectedEquipmentKey.value) return;
    try {
      const data = toEquipmentAssignment(selectedEquipment.value);
      delete data.sheetName;
      await attachEquipment({
        id: orderId,
        unitId: targetUnitId.value,
        data,
      });
      showModal.value = false;
      notifySuccess('Equipo asignado correctamente.');
    } catch (error) {
      notifyError(error, 'Error al asignar equipo');
    }
  }

  return {
    showModal,
    targetUnit,
    selectedEquipmentKey,
    selectedEquipment,
    openAddEquipment,
    handleEquipmentSelect,
    handleAddEquipment,
  };
}
