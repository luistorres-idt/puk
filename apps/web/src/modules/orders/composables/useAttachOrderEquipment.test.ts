import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalEquipment } from '@puk/contracts';
import type { OrderDetail } from '../api.js';
import { useAttachOrderEquipment } from './useAttachOrderEquipment.js';

const selectedEquipment: ExternalEquipment = {
  externalKey: 'equipment-1',
  id: 'external-1',
  imei: '123456789012345',
  brand: 'Teltonika',
  model: 'FMB920',
  line: 'LTE',
  iccid: '123',
  carrier: 'Carrier',
  condition: 'NEW',
  currentClient: null,
  serviceStatus: 'AVAILABLE',
  unit: null,
  unitMakeModel: null,
  unitYear: null,
  unitSerialNumber: null,
  serviceType: null,
  rowNumber: 4,
  hasValidIdentity: true,
  rawValues: { A: 'value' },
};

function createForm() {
  const order = ref({
    serviceType: 'INSTALLATION',
    units: [{ id: 'unit-1', serviceType: 'REVIEW' }],
  } as OrderDetail);
  const canAddItems = ref(true);
  const attachEquipment = vi.fn(async () => undefined);
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const form = useAttachOrderEquipment({
    orderId: 'order-1',
    order,
    canAddItems,
    attachEquipment,
    notifySuccess,
    notifyError,
  });
  return { form, canAddItems, attachEquipment, notifySuccess, notifyError };
}

describe('useAttachOrderEquipment', () => {
  it('opens only when permitted and resets selections for the target unit', () => {
    const { form, canAddItems } = createForm();
    canAddItems.value = false;
    form.openAddEquipment('unit-1');
    expect(form.showModal.value).toBe(false);

    canAddItems.value = true;
    form.openAddEquipment('unit-1');
    expect(form.showModal.value).toBe(true);
    expect(form.targetUnit.value?.serviceType).toBe('REVIEW');
    form.selectedEquipmentKey.value = 'equipment-1';
    form.handleEquipmentSelect(selectedEquipment);
    form.openAddEquipment('unit-1');
    expect(form.selectedEquipmentKey.value).toBeNull();
    expect(form.selectedEquipment.value).toBeNull();
  });

  it('submits the existing snapshot payload and closes on success', async () => {
    const { form, attachEquipment, notifySuccess } = createForm();
    form.openAddEquipment('unit-1');
    form.selectedEquipmentKey.value = 'equipment-1';
    form.handleEquipmentSelect(selectedEquipment);

    await form.handleAddEquipment();

    expect(attachEquipment).toHaveBeenCalledWith({
      id: 'order-1',
      unitId: 'unit-1',
      data: {
        externalKey: 'equipment-1',
        externalId: 'external-1',
        imei: '123456789012345',
        sheetRowHint: 4,
        brandSnapshot: 'Teltonika',
        modelSnapshot: 'FMB920',
        lineSnapshot: 'LTE',
        iccidSnapshot: '123',
        carrierSnapshot: 'Carrier',
        equipmentConditionSnapshot: 'NEW',
        serviceStatusSnapshot: 'AVAILABLE',
        rawSnapshot: { A: 'value' },
      },
    });
    expect(form.showModal.value).toBe(false);
    expect(notifySuccess).toHaveBeenCalledWith('Equipo asignado correctamente.');
  });

  it('does not submit without permission or a complete selection', async () => {
    const { form, canAddItems, attachEquipment } = createForm();
    form.openAddEquipment('unit-1');
    await form.handleAddEquipment();
    form.selectedEquipmentKey.value = 'equipment-1';
    form.handleEquipmentSelect(selectedEquipment);
    canAddItems.value = false;
    await form.handleAddEquipment();
    expect(attachEquipment).not.toHaveBeenCalled();
  });

  it('keeps the modal open and reports mutation errors', async () => {
    const { form, attachEquipment, notifyError } = createForm();
    const error = new Error('unavailable');
    attachEquipment.mockRejectedValueOnce(error);
    form.openAddEquipment('unit-1');
    form.selectedEquipmentKey.value = 'equipment-1';
    form.handleEquipmentSelect(selectedEquipment);

    await form.handleAddEquipment();

    expect(form.showModal.value).toBe(true);
    expect(notifyError).toHaveBeenCalledWith(error, 'Error al asignar equipo');
  });
});
