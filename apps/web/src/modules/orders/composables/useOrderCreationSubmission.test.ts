import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type {
  CreateOrder,
  ExternalClient,
  ExternalEquipment,
  OrderServiceType,
  TechnicianOption,
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
  createOrder = vi.fn(async (payload: CreateOrder) => {
    void payload;
    return { id: 'ORDER-1' };
  }),
) {
  return { createOrder, navigate: vi.fn(async () => undefined) };
}

describe('useOrderCreationSubmission', () => {
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

  it('builds the order payload and navigates to the created order', async () => {
    const state = createState();
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
    );
  });

  it('blocks duplicate submissions while loading and exposes request errors', async () => {
    const state = createState();
    let rejectRequest!: (error: unknown) => void;
    const createOrder = vi.fn(
      () => new Promise<{ id: string }>((_resolve, reject) => (rejectRequest = reject)),
    );
    const deps = dependencies(createOrder);
    const submission = useOrderCreationSubmission(state, deps);

    const pending = submission.handleFinish();
    expect(submission.loading.value).toBe(true);
    await submission.handleFinish();
    expect(createOrder).toHaveBeenCalledOnce();

    rejectRequest(new Error('Creation failed'));
    await pending;
    expect(state.error.value).toBe('Creation failed');
    expect(submission.loading.value).toBe(false);
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});
