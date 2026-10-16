import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  type CreateOrder,
  type ExternalClient,
  type ExternalEquipment,
  type OrderServiceType,
  type TechnicianOption,
} from '@puk/contracts';
import type { ConfiguredUnitItem } from './configured-order-unit.js';
import { useOrderCreationSubmission } from './useOrderCreationSubmission.js';

const technician: TechnicianOption = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Technician',
  workshop: null,
  city: null,
};

function equipment(externalKey: string): ExternalEquipment {
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
    unit: null,
    unitMakeModel: null,
    unitYear: null,
    unitSerialNumber: null,
    serviceType: null,
    rowNumber: 2,
    hasValidIdentity: true,
    rawValues: {},
  };
}

function createState() {
  return {
    activeServiceType: ref<OrderServiceType>('INSTALLATION'),
    configuredUnits: ref<ConfiguredUnitItem[]>([]),
    currentStep: ref(5),
    error: ref<string | null>('Previous error'),
    generalNotes: ref(''),
    isHomeService: ref(false),
    scheduledAtTimestamp: ref(Date.parse('2026-09-22T12:00:00.000Z')),
    selectedClient: ref<ExternalClient | null>({ id: 'CLIENT-1', name: 'Client One' }),
    selectedClientId: ref<string | null>('CLIENT-1'),
    selectedTechnician: ref<TechnicianOption | null>(technician),
    serviceAddress: ref(''),
    technicianId: ref<string | null>(technician.id),
  };
}

function dependencies(
  createOrder: (payload: CreateOrder, key: string) => Promise<{ id: string }> = vi.fn(
    async (payload: CreateOrder) => {
      void payload;
      return { id: 'ORDER-1' };
    },
  ),
) {
  return { createOrder, navigate: vi.fn(async () => undefined) };
}

describe('useOrderCreationSubmission', () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
    });
  });

  it('tracks technician validity reactively', () => {
    const state = createState();
    const submission = useOrderCreationSubmission(state, dependencies());

    expect(submission.hasValidTechnician.value).toBe(true);
    state.technicianId.value = null;
    expect(submission.hasValidTechnician.value).toBe(false);
  });

  it('returns silently when the selected client is incomplete', async () => {
    const state = createState();
    const deps = dependencies();
    state.selectedClient.value = null;

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.error.value).toBe('Previous error');
  });

  it('returns to the technician step with the existing validation message', async () => {
    const state = createState();
    const deps = dependencies();
    state.selectedTechnician.value = null;

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(state.currentStep.value).toBe(4);
    expect(state.error.value).toBe('Selecciona un técnico válido antes de crear la orden.');
    expect(deps.createOrder).not.toHaveBeenCalled();
  });

  it('rejects oversized order notes before sending and keeps the draft intact', async () => {
    const state = createState();
    const deps = dependencies();
    state.generalNotes.value = 'x'.repeat(5001);

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.generalNotes.value).toHaveLength(5001);
    expect(state.error.value).toContain('5,000');
  });

  it('rejects an oversized selected Sheets client name before sending and keeps the selection', async () => {
    const state = createState();
    const deps = dependencies();
    const longName = `${'a'.repeat(199)}😀`;
    state.selectedClient.value = { id: 'CLIENT-LONG', name: longName };
    state.selectedClientId.value = 'CLIENT-LONG';

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.selectedClient.value?.name).toBe(longName);
    expect(state.selectedClientId.value).toBe('CLIENT-LONG');
    expect(state.error.value).toContain('200');
  });

  it('blocks an overlong configured label before sending and keeps the wizard draft', async () => {
    const state = createState();
    const label = ` ${'x'.repeat(MAX_ORDER_UNIT_LABEL_LENGTH + 1)} `;
    state.configuredUnits.value = [
      {
        id: 'unit-long-label',
        serviceType: 'INSTALLATION',
        label,
        makeModel: 'Model',
        serialNumber: 'Serial',
        year: 2025,
        equipment: equipment('EQ-1'),
      },
    ];
    const deps = dependencies();

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.configuredUnits.value[0]?.label).toBe(label);
    expect(state.error.value).toContain(`${MAX_ORDER_UNIT_LABEL_LENGTH}`);
  });

  it('blocks an overlong catalog-derived make/model before sending and keeps the wizard draft', async () => {
    const state = createState();
    const makeModel = ` ${'x'.repeat(MAX_ORDER_UNIT_MAKE_MODEL_LENGTH + 1)} `;
    state.configuredUnits.value = [
      {
        id: 'unit-long-model',
        serviceType: 'INSTALLATION',
        label: 'Truck 1',
        makeModel,
        serialNumber: 'Serial',
        year: 2025,
        equipment: equipment('EQ-LONG-MODEL'),
      },
    ];
    const deps = dependencies();

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.configuredUnits.value[0]?.makeModel).toBe(makeModel);
    expect(state.error.value).toContain(`${MAX_ORDER_UNIT_MAKE_MODEL_LENGTH}`);
    expect(state.currentStep.value).toBe(2);
  });

  it('blocks an overlong serial number before sending and keeps the wizard draft', async () => {
    const state = createState();
    const serialNumber = ` ${'s'.repeat(MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH + 1)} `;
    state.configuredUnits.value = [
      {
        id: 'unit-long-serial',
        serviceType: 'INSTALLATION',
        label: 'Truck 1',
        makeModel: 'Model',
        serialNumber,
        year: 2025,
        equipment: equipment('EQ-LONG-SERIAL'),
      },
    ];
    const deps = dependencies();

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.configuredUnits.value[0]?.serialNumber).toBe(serialNumber);
    expect(state.error.value).toContain(`${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH}`);
  });

  it('builds the order payload and navigates to the created order', async () => {
    const state = createState();
    state.selectedClient.value = { id: 'CLIENT-1', name: '  Client One  ' };
    const deps = dependencies();
    const installed = equipment('OLD');
    const replacement = equipment('NEW');
    state.configuredUnits.value = [
      {
        id: 'unit-1',
        serviceType: 'EQUIPMENT_REPLACEMENT',
        label: '  Truck 1  ',
        makeModel: '  Freightliner  ',
        serialNumber: '  VIN-1  ',
        year: 2025,
        equipment: installed,
        replacementEquipment: replacement,
      },
      {
        id: 'unit-2',
        serviceType: 'REVIEW',
        label: 'Truck 2',
        makeModel: 'Kenworth',
        serialNumber: 'VIN-2',
        year: null,
        equipment: null,
      },
    ];

    const submission = useOrderCreationSubmission(state, deps);
    await submission.handleFinish();

    expect(deps.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        clientSheetId: 'CLIENT-1',
        clientNameSnapshot: 'Client One',
        serviceType: 'EQUIPMENT_REPLACEMENT',
        scheduledAt: '2026-09-22T12:00:00.000Z',
        isHomeService: false,
        serviceAddress: null,
        generalNotes: null,
        technicianId: technician.id,
        units: [
          expect.objectContaining({
            label: 'Truck 1',
            makeModel: 'Freightliner',
            serialNumber: 'VIN-1',
            equipment: [
              expect.objectContaining({ externalKey: 'OLD' }),
              expect.objectContaining({ externalKey: 'NEW' }),
            ],
          }),
          expect.objectContaining({ equipment: undefined }),
        ],
      }),
      expect.any(String),
    );
    expect(deps.navigate).toHaveBeenCalledWith('/orders/ORDER-1');
    expect(submission.loading.value).toBe(false);
    expect(state.error.value).toBeNull();
  });

  it('uses the active service and omits units when none are configured', async () => {
    const state = createState();
    const deps = dependencies();
    state.activeServiceType.value = 'FUEL_SENSOR';
    state.serviceAddress.value = 'Workshop';
    state.generalNotes.value = 'Call on arrival';

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceType: 'FUEL_SENSOR',
        serviceAddress: 'Workshop',
        generalNotes: 'Call on arrival',
        units: undefined,
      }),
      expect.any(String),
    );
  });

  it('blocks duplicate submissions while loading and exposes request errors', async () => {
    const state = createState();
    state.generalNotes.value = 'Keep this draft';
    let rejectRequest!: (error: unknown) => void;
    const createOrder = vi.fn(
      () => new Promise<{ id: string }>((_resolve, reject) => (rejectRequest = reject)),
    );
    const deps = dependencies(createOrder);
    const submission = useOrderCreationSubmission(state, deps);

    const pending = submission.handleFinish();
    expect(submission.loading.value).toBe(true);
    await submission.handleFinish();
    await vi.waitFor(() => expect(createOrder).toHaveBeenCalledOnce());

    rejectRequest(new Error('Creation failed'));
    await pending;
    expect(state.error.value).toBe('Creation failed');
    expect(state.generalNotes.value).toBe('Keep this draft');
    expect(submission.loading.value).toBe(false);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('reuses the persisted key after an ambiguous failure and clears it after success', async () => {
    const state = createState();
    const createOrder = vi
      .fn<(payload: CreateOrder, key: string) => Promise<{ id: string }>>()
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce({ id: 'ORDER-1' });
    const first = useOrderCreationSubmission(state, dependencies(createOrder));

    await first.handleFinish();
    const firstKey = createOrder.mock.calls[0]?.[1];
    expect(firstKey).toBeTruthy();
    expect(sessionStorage.getItem('puk:orders:create:pending')).toContain(firstKey);
    expect(sessionStorage.getItem('puk:orders:create:pending')).not.toContain('Client One');

    await useOrderCreationSubmission(state, dependencies(createOrder)).handleFinish();

    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createOrder.mock.calls[1]?.[1]).toBe(firstKey);
    expect(sessionStorage.getItem('puk:orders:create:pending')).toBeNull();
  });

  it('blocks an oversized service address without sending or changing the draft', async () => {
    const state = createState();
    state.serviceAddress.value = '  ' + 'a'.repeat(501) + '  ';
    const deps = dependencies();

    await useOrderCreationSubmission(state, deps).handleFinish();

    expect(deps.createOrder).not.toHaveBeenCalled();
    expect(state.serviceAddress.value).toBe('  ' + 'a'.repeat(501) + '  ');
    expect(state.error.value).toContain('500');
  });
});
