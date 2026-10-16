import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../api.js';
import {
  getTechnicianBaseRate,
  useOrderPricingModal,
  ALL_ORDER_SERVICES,
} from './useOrderPricingModal.js';

function createMockOrder(partial: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'ord-123',
    folio: 'FOL-001',
    status: 'IN_PROGRESS',
    version: 1,
    serviceType: 'INSTALLATION',
    clientNameSnapshot: 'Test Client',
    clientSheetId: 'SHEET-1',
    scheduledAt: new Date().toISOString(),
    isHomeService: true,
    serviceAddress: 'Calle Falsa 123',
    generalNotes: null,
    failedReason: null,
    failedAppointmentResolution: null,
    failedAppointmentResolvedAt: null,
    failedAppointmentResolutionReason: null,
    rescheduledFrom: null,
    rescheduledOrder: null,
    technician: {
      id: 'tech-1',
      name: 'Juan Perez',
      installationRate: '500.00',
      reviewRate: '250.00',
      uninstallationRate: '300.00',
      replacementRate: '600.00',
      failedAppointmentRate: '200.00',
      fuelSensorRate: '400.00',
    },
    units: [
      {
        id: 'unit-1',
        label: 'Tracto 1',
        makeModel: 'Kenworth',
        serialNumber: 'SN123',
        year: 2022,
        serviceType: 'INSTALLATION',
        status: 'PENDING',
        equipment: [],
        evidence: [],
        checklist: null,
      },
      {
        id: 'unit-2',
        label: 'Tracto 2',
        makeModel: 'Volvo',
        serialNumber: 'SN456',
        year: 2023,
        serviceType: 'REVIEW',
        status: 'PENDING',
        equipment: [],
        evidence: [],
        checklist: null,
      },
    ],
    signature: null,
    pricingBaseCost: null,
    pricingTravelExpenses: null,
    pricingTotal: null,
    pricingBreakdown: null,
    pricingOverrides: null,
    ...partial,
  };
}

describe('useOrderPricingModal', () => {
  it('resolves technician base rate correctly for all services', () => {
    const order = createMockOrder();
    expect(getTechnicianBaseRate('INSTALLATION', order)).toBe('500.00');
    expect(getTechnicianBaseRate('REVIEW', order)).toBe('250.00');
    expect(getTechnicianBaseRate('UNINSTALLATION', order)).toBe('300.00');
    expect(getTechnicianBaseRate('EQUIPMENT_REPLACEMENT', order)).toBe('600.00');
    expect(getTechnicianBaseRate('FAILED_APPOINTMENT', order)).toBe('200.00');
    expect(getTechnicianBaseRate('FUEL_SENSOR', order)).toBe('400.00');
    expect(getTechnicianBaseRate('INSTALLATION', null)).toBeNull();
  });

  it('initializes with null overrides when order has no existing pricingOverrides', () => {
    const orderRef = ref(createMockOrder());
    const updatePricing = vi.fn().mockResolvedValue({});
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();

    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess,
      notifyError,
    });

    modal.openPricingModal();

    expect(modal.showPricingModal.value).toBe(true);
    expect(modal.rates.value.INSTALLATION).toBeNull();
    expect(modal.rates.value.REVIEW).toBeNull();
    expect(modal.travelExpenses.value).toBeNull();
    expect(modal.reason.value).toBe('');
    expect(modal.distinctOrderServices.value).toEqual(['INSTALLATION', 'REVIEW']);
  });

  it('initializes with existing pricingOverrides from order', () => {
    const orderRef = ref(
      createMockOrder({
        pricingOverrides: {
          rates: {
            INSTALLATION: '650.00',
            REVIEW: '350.50',
          },
          travelExpenses: '150.00',
          reason: 'Tarifa negociada para domingo',
        },
      }),
    );
    const updatePricing = vi.fn().mockResolvedValue({});
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();

    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess,
      notifyError,
    });

    modal.openPricingModal();

    expect(modal.rates.value.INSTALLATION).toBe('650.00');
    expect(modal.rates.value.REVIEW).toBe('350.50');
    expect(modal.travelExpenses.value).toBe('150.00');
    expect(modal.reason.value).toBe('Tarifa negociada para domingo');
  });

  it('toggles all services display', () => {
    const orderRef = ref(createMockOrder());
    const updatePricing = vi.fn().mockResolvedValue({});
    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    modal.openPricingModal();
    expect(modal.displayedServices.value).toEqual(['INSTALLATION', 'REVIEW']);

    modal.showAllServices.value = true;
    expect(modal.displayedServices.value).toEqual(ALL_ORDER_SERVICES);
  });

  it('submits valid decimal strings and notifies success', async () => {
    const orderRef = ref(createMockOrder());
    const updatePricing = vi.fn().mockResolvedValue({});
    const notifySuccess = vi.fn();
    const notifyError = vi.fn();
    const onSaved = vi.fn();

    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess,
      notifyError,
      onSaved,
    });

    modal.openPricingModal();
    modal.rates.value.INSTALLATION = '750';
    modal.travelExpenses.value = '200';
    modal.reason.value = 'Condiciones de lluvia y lejanía';

    await modal.handleSave();

    expect(updatePricing).toHaveBeenCalledWith({
      id: 'ord-123',
      overrides: {
        rates: {
          INSTALLATION: '750',
        },
        travelExpenses: '200',
        reason: 'Condiciones de lluvia y lejanía',
      },
    });
    expect(notifySuccess).toHaveBeenCalledWith('Tarifas de la orden configuradas exitosamente.');
    expect(modal.showPricingModal.value).toBe(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it('formats finalized order notification message accordingly', async () => {
    const orderRef = ref(createMockOrder({ status: 'COMPLETED' }));
    const updatePricing = vi.fn().mockResolvedValue({});
    const notifySuccess = vi.fn();

    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess,
      notifyError: vi.fn(),
    });

    modal.openPricingModal();
    modal.rates.value.INSTALLATION = '600';

    await modal.handleSave();

    expect(notifySuccess).toHaveBeenCalledWith(
      'Liquidación técnica recalculada y actualizada exitosamente.',
    );
  });

  it('validates against negative rates', async () => {
    const orderRef = ref(createMockOrder());
    const updatePricing = vi.fn();
    const notifyError = vi.fn();

    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError,
    });

    modal.openPricingModal();
    modal.rates.value.INSTALLATION = '-100';

    await modal.handleSave();

    expect(updatePricing).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('no puede ser negativa') }),
      'Error de validación',
    );
  });

  it('validates against negative travel expenses', async () => {
    const orderRef = ref(createMockOrder());
    const updatePricing = vi.fn();
    const notifyError = vi.fn();

    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError,
    });

    modal.openPricingModal();
    modal.travelExpenses.value = '-50';

    await modal.handleSave();

    expect(updatePricing).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Los viáticos no pueden ser negativos.' }),
      'Error de validación',
    );
  });

  it('resets rate to base and travel expenses to null', () => {
    const orderRef = ref(createMockOrder());
    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: orderRef,
      updatePricing: vi.fn(),
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    modal.rates.value.INSTALLATION = '600';
    modal.travelExpenses.value = '100';

    modal.resetRateToBase('INSTALLATION');
    modal.resetTravelExpenses();

    expect(modal.rates.value.INSTALLATION).toBeNull();
    expect(modal.travelExpenses.value).toBeNull();
  });

  it.each([
    ['above maximum', '100000000.00'],
    ['three decimals', '1.234'],
    ['infinity', 'Infinity'],
    ['negative', '-1.00'],
    ['comma decimal', '1,25'],
  ])('rejects an invalid rate (%s) without changing the draft', async (_case, value) => {
    const updatePricing = vi.fn();
    const notifyError = vi.fn();
    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: ref(createMockOrder()),
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError,
    });

    modal.openPricingModal();
    modal.rates.value.INSTALLATION = value;
    await modal.handleSave();

    expect(updatePricing).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith(expect.any(Error), 'Error de validación');
    expect(modal.showPricingModal.value).toBe(true);
    expect(modal.rates.value.INSTALLATION).toBe(value);
  });

  it('preserves valid decimal input exactly, including zero and the maximum', async () => {
    const updatePricing = vi.fn().mockResolvedValue({});
    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: ref(createMockOrder()),
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    modal.openPricingModal();
    modal.rates.value.INSTALLATION = '99999999.99';
    modal.travelExpenses.value = '0';
    await modal.handleSave();

    expect(updatePricing).toHaveBeenCalledWith({
      id: 'ord-123',
      overrides: {
        rates: { INSTALLATION: '99999999.99' },
        travelExpenses: '0',
        reason: null,
      },
    });
  });

  it('treats empty inputs as absent and retains an invalid third decimal for correction', async () => {
    const updatePricing = vi.fn().mockResolvedValue({});
    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: ref(
        createMockOrder({
          pricingOverrides: { rates: { INSTALLATION: '500.00' }, travelExpenses: '20.00' },
        }),
      ),
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError: vi.fn(),
    });

    modal.openPricingModal();
    expect(modal.rates.value.INSTALLATION).toBe('500.00');
    modal.rates.value.INSTALLATION = '1.234';
    modal.travelExpenses.value = '';
    await modal.handleSave();

    expect(updatePricing).not.toHaveBeenCalled();
    expect(modal.rates.value.INSTALLATION).toBe('1.234');
    expect(modal.travelExpenses.value).toBe('');
    modal.resetRateToBase('INSTALLATION');
    expect(modal.rates.value.INSTALLATION).toBeNull();
  });

  it('does not allow duplicate submissions and preserves the draft after an API error', async () => {
    let rejectRequest: (error: Error) => void = () => {};
    const updatePricing = vi.fn(() => new Promise((_resolve, reject) => (rejectRequest = reject)));
    const notifyError = vi.fn();
    const modal = useOrderPricingModal({
      orderId: 'ord-123',
      order: ref(createMockOrder()),
      updatePricing,
      notifySuccess: vi.fn(),
      notifyError,
    });

    modal.openPricingModal();
    modal.rates.value.INSTALLATION = '12.30';
    const first = modal.handleSave();
    await modal.handleSave();
    expect(updatePricing).toHaveBeenCalledTimes(1);
    rejectRequest(new Error('server failed'));
    await first;

    expect(notifyError).toHaveBeenCalledWith(
      expect.any(Error),
      'Error al actualizar tarifas de la orden',
    );
    expect(modal.showPricingModal.value).toBe(true);
    expect(modal.rates.value.INSTALLATION).toBe('12.30');
  });
});
