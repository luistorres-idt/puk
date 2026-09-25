import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { ExternalEquipment } from '@puk/contracts';
import type { OrderDetail } from '../api.js';
import { useAddOrderUnit } from './useAddOrderUnit.js';

function equipment(externalKey: string, hasValidIdentity = true): ExternalEquipment {
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
    unit: 'Truck 1',
    unitMakeModel: 'Kenworth T680',
    unitYear: '2025',
    unitSerialNumber: 'VIN-1',
    serviceType: null,
    rowNumber: 2,
    hasValidIdentity,
    rawValues: {},
  };
}

function createForm(serviceType: OrderDetail['serviceType'] = 'INSTALLATION') {
  const order = ref({ serviceType } as OrderDetail);
  const canAddItems = ref(true);
  const assignedEquipmentKeys = ref(['already-assigned']);
  const insertUnit = vi.fn(async () => undefined);
  const notifyWarning = vi.fn();
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const form = useAddOrderUnit({
    orderId: 'order-1',
    order,
    canAddItems,
    assignedEquipmentKeys,
    insertUnit,
    notifyWarning,
    notifySuccess,
    notifyError,
  });
  return {
    form,
    order,
    canAddItems,
    assignedEquipmentKeys,
    insertUnit,
    notifyWarning,
    notifySuccess,
    notifyError,
  };
}

describe('useAddOrderUnit', () => {
  it('opens only when permitted and resets modal selections with the order service', async () => {
    const { form, canAddItems } = createForm('REVIEW');
    canAddItems.value = false;
    form.openAddUnitModal();
    expect(form.showAddUnitModal.value).toBe(false);

    canAddItems.value = true;
    form.openAddUnitModal();
    await nextTick();
    expect(form.showAddUnitModal.value).toBe(true);
    expect(form.newUnit.value.serviceType).toBe('REVIEW');
    expect(form.newUnit.value.year).toBe(new Date().getFullYear());

    form.unitModalEquipmentKey.value = 'old';
    form.replacementNewEquipmentKey.value = 'new';
    form.openAddUnitModal();
    expect(form.unitModalEquipmentKey.value).toBeNull();
    expect(form.replacementNewEquipmentKey.value).toBeNull();
  });

  it('clears selections on service change and autofills installed unit details', async () => {
    const { form } = createForm();
    form.newUnit.value.label = 'Manual label';
    form.unitModalEquipmentKey.value = 'old';
    form.replacementNewEquipmentKey.value = 'new';
    form.newUnit.value.serviceType = 'EQUIPMENT_REPLACEMENT';
    await nextTick();

    expect(form.newUnit.value.label).toBe('');
    expect(form.unitModalEquipmentKey.value).toBeNull();
    expect(form.replacementNewEquipmentKey.value).toBeNull();
    expect(form.excludeKeysForModalReplacementOld.value).toEqual(['already-assigned']);
    form.unitModalEquipmentKey.value = 'old';
    form.replacementNewEquipmentKey.value = 'new';
    expect(form.excludeKeysForModalReplacementOld.value).toEqual(['already-assigned', 'new']);
    expect(form.excludeKeysForModalReplacementNew.value).toEqual(['already-assigned', 'old']);

    form.handleUnitModalEquipmentSelect(equipment('old'));
    expect(form.newUnit.value).toMatchObject({
      label: 'Truck 1',
      makeModel: 'Kenworth T680',
      serialNumber: 'VIN-1',
      year: 2025,
    });
  });

  it('preserves validation warnings and does not submit incomplete units', async () => {
    const { form, insertUnit, notifyWarning } = createForm();
    await form.handleAddUnit();
    expect(notifyWarning).toHaveBeenLastCalledWith(
      'Por favor completa los campos obligatorios de la unidad.',
    );

    form.newUnit.value = {
      label: 'Truck 1',
      makeModel: 'Kenworth',
      serialNumber: 'VIN-1',
      year: 2025,
      serviceType: 'REVIEW',
    };
    await nextTick();
    form.newUnit.value.label = 'Truck 1';
    form.newUnit.value.makeModel = 'Kenworth';
    form.newUnit.value.serialNumber = 'VIN-1';
    await form.handleAddUnit();
    expect(notifyWarning).toHaveBeenLastCalledWith(
      'Debes seleccionar un equipo válido instalado del cliente.',
    );

    form.newUnit.value.serviceType = 'EQUIPMENT_REPLACEMENT';
    await nextTick();
    form.newUnit.value.label = 'Truck 1';
    form.newUnit.value.makeModel = 'Kenworth';
    form.newUnit.value.serialNumber = 'VIN-1';
    await form.handleAddUnit();
    expect(notifyWarning).toHaveBeenLastCalledWith(
      'Debes seleccionar el equipo actualmente instalado con el cliente.',
    );
    form.handleUnitModalEquipmentSelect(equipment('old'));
    await form.handleAddUnit();
    expect(notifyWarning).toHaveBeenLastCalledWith(
      'Debes seleccionar el equipo nuevo de reemplazo (sin instalar de almacén).',
    );
    expect(insertUnit).not.toHaveBeenCalled();
  });

  it('submits the trimmed payload and clears the form only after success', async () => {
    const { form, insertUnit, notifySuccess } = createForm();
    form.openAddUnitModal();
    form.newUnit.value.label = '  Truck 1  ';
    form.newUnit.value.makeModel = '  Kenworth  ';
    form.newUnit.value.serialNumber = '  VIN-1  ';
    form.unitModalEquipmentKey.value = 'new';
    form.handleUnitModalEquipmentSelect(equipment('new'));

    await form.handleAddUnit();

    expect(insertUnit).toHaveBeenCalledWith({
      id: 'order-1',
      data: {
        label: 'Truck 1',
        makeModel: 'Kenworth',
        serialNumber: 'VIN-1',
        year: new Date().getFullYear(),
        serviceType: 'INSTALLATION',
        equipment: [expect.objectContaining({ externalKey: 'new', externalId: 'new' })],
      },
    });
    expect(form.showAddUnitModal.value).toBe(false);
    expect(form.newUnit.value.serviceType).toBe('INSTALLATION');
    expect(form.unitModalEquipmentKey.value).toBeNull();
    expect(notifySuccess).toHaveBeenCalledWith('Unidad agregada correctamente.');
  });

  it('keeps the form open and forwards the original error on mutation failure', async () => {
    const { form, insertUnit, notifyError } = createForm();
    const error = new Error('offline');
    insertUnit.mockRejectedValueOnce(error);
    form.openAddUnitModal();
    form.newUnit.value.label = 'Truck 1';
    form.newUnit.value.makeModel = 'Kenworth';
    form.newUnit.value.serialNumber = 'VIN-1';

    await form.handleAddUnit();

    expect(form.showAddUnitModal.value).toBe(true);
    expect(form.newUnit.value.label).toBe('Truck 1');
    expect(notifyError).toHaveBeenCalledWith(error, 'Error al agregar unidad');
  });
});
