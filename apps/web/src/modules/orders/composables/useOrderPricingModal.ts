import { computed, ref, type Ref } from 'vue';
import { safeParse } from 'valibot';
import type { OrderPricingOverrides, OrderServiceType } from '@puk/contracts';
import { ORDER_SERVICE_LABELS, PricingRateOverrideSchema } from '@puk/contracts';
import type { OrderDetail } from '../api.js';

export interface UseOrderPricingModalOptions {
  orderId: string;
  order: Ref<OrderDetail | undefined>;
  updatePricing: (input: { id: string; overrides: OrderPricingOverrides }) => Promise<unknown>;
  notifySuccess: (message: string) => void;
  notifyError: (error: unknown, fallback: string) => void;
  onSaved?: () => void;
}

export const ALL_ORDER_SERVICES: readonly OrderServiceType[] = [
  'INSTALLATION',
  'REVIEW',
  'UNINSTALLATION',
  'EQUIPMENT_REPLACEMENT',
  'FAILED_APPOINTMENT',
  'FUEL_SENSOR',
] as const;

export function getTechnicianBaseRate(
  serviceType: OrderServiceType,
  order?: OrderDetail | null,
): string | null {
  const tech = order?.technician;
  if (!tech) return null;
  switch (serviceType) {
    case 'INSTALLATION':
      return tech.installationRate ?? null;
    case 'REVIEW':
      return tech.reviewRate ?? null;
    case 'UNINSTALLATION':
      return tech.uninstallationRate ?? null;
    case 'EQUIPMENT_REPLACEMENT':
      return tech.replacementRate ?? null;
    case 'FAILED_APPOINTMENT':
      return tech.failedAppointmentRate ?? null;
    case 'FUEL_SENSOR':
      return tech.fuelSensorRate ?? null;
    default:
      return null;
  }
}

function createInitialRates(): Record<OrderServiceType, string | null> {
  return {
    INSTALLATION: null,
    REVIEW: null,
    UNINSTALLATION: null,
    EQUIPMENT_REPLACEMENT: null,
    FAILED_APPOINTMENT: null,
    FUEL_SENSOR: null,
  };
}

export function useOrderPricingModal(options: UseOrderPricingModalOptions) {
  const { orderId, order, updatePricing, notifySuccess, notifyError, onSaved } = options;

  const showPricingModal = ref(false);
  const isSubmitting = ref(false);
  const showAllServices = ref(false);

  const rates = ref<Record<OrderServiceType, string | null>>(createInitialRates());
  const travelExpenses = ref<string | null>(null);
  const reason = ref<string>('');

  const isFinalized = computed(() => {
    const s = order.value?.status;
    return s === 'COMPLETED' || s === 'FAILED_APPOINTMENT';
  });

  const distinctOrderServices = computed<OrderServiceType[]>(() => {
    const currentOrder = order.value;
    if (!currentOrder) return ['INSTALLATION'];

    const set = new Set<OrderServiceType>();
    if (currentOrder.serviceType) {
      set.add(currentOrder.serviceType);
    }
    if (currentOrder.units) {
      for (const u of currentOrder.units) {
        if (u.serviceType) {
          set.add(u.serviceType);
        }
      }
    }
    if (currentOrder.pricingBreakdown?.breakdown) {
      for (const item of currentOrder.pricingBreakdown.breakdown) {
        set.add(item.serviceType);
      }
    }
    if (currentOrder.pricingOverrides?.rates) {
      for (const key of Object.keys(currentOrder.pricingOverrides.rates)) {
        set.add(key as OrderServiceType);
      }
    }
    if (currentOrder.status === 'FAILED_APPOINTMENT') {
      set.add('FAILED_APPOINTMENT');
    }

    return Array.from(set);
  });

  const displayedServices = computed<OrderServiceType[]>(() => {
    if (showAllServices.value) {
      return [...ALL_ORDER_SERVICES];
    }
    const orderSvcs = distinctOrderServices.value;
    return orderSvcs.length > 0 ? orderSvcs : [...ALL_ORDER_SERVICES];
  });

  function initializeFromOrder() {
    const currentOrder = order.value;
    const initialRates = createInitialRates();

    const existingOverrides = currentOrder?.pricingOverrides;

    for (const svc of ALL_ORDER_SERVICES) {
      if (existingOverrides?.rates && svc in existingOverrides.rates) {
        const val = existingOverrides.rates[svc];
        initialRates[svc] = val ?? null;
      }
    }

    rates.value = initialRates;

    if (
      existingOverrides?.travelExpenses !== undefined &&
      existingOverrides.travelExpenses !== null
    ) {
      travelExpenses.value = existingOverrides.travelExpenses;
    } else {
      travelExpenses.value = null;
    }

    reason.value = existingOverrides?.reason ?? '';
    showAllServices.value = false;
  }

  function openPricingModal() {
    initializeFromOrder();
    showPricingModal.value = true;
  }

  function closePricingModal() {
    showPricingModal.value = false;
  }

  function resetRateToBase(svc: OrderServiceType) {
    rates.value[svc] = null;
  }

  function resetTravelExpenses() {
    travelExpenses.value = null;
  }

  async function handleSave() {
    if (isSubmitting.value) return;

    if (reason.value && reason.value.length > 500) {
      notifyError(new Error('El motivo no puede exceder 500 caracteres.'), 'Error de validación');
      return;
    }

    const ratesPayload: Partial<Record<OrderServiceType, string>> = {};
    for (const [svc, val] of Object.entries(rates.value)) {
      if (val !== null && val !== undefined && val !== '') {
        if (val.startsWith('-')) {
          notifyError(
            new Error(
              `La tarifa para ${ORDER_SERVICE_LABELS[svc as OrderServiceType] ?? svc} no puede ser negativa.`,
            ),
            'Error de validación',
          );
          return;
        }
        const parsed = safeParse(PricingRateOverrideSchema, val);
        if (!parsed.success) {
          const label = ORDER_SERVICE_LABELS[svc as OrderServiceType] ?? svc;
          notifyError(
            new Error(`La tarifa para ${label} no es válida: ${parsed.issues[0]?.message ?? ''}`),
            'Error de validación',
          );
          return;
        }
        ratesPayload[svc as OrderServiceType] = parsed.output;
      }
    }

    let validatedTravelExpenses: string | null = null;
    if (
      travelExpenses.value !== null &&
      travelExpenses.value !== undefined &&
      travelExpenses.value !== ''
    ) {
      if (travelExpenses.value.startsWith('-')) {
        notifyError(new Error('Los viáticos no pueden ser negativos.'), 'Error de validación');
        return;
      }
      const parsed = safeParse(PricingRateOverrideSchema, travelExpenses.value);
      if (!parsed.success) {
        notifyError(
          new Error(`Los viáticos no son válidos: ${parsed.issues[0]?.message ?? ''}`),
          'Error de validación',
        );
        return;
      }
      validatedTravelExpenses = parsed.output;
    }

    const payload: OrderPricingOverrides = {
      rates:
        Object.keys(ratesPayload).length > 0
          ? (ratesPayload as Record<OrderServiceType, string>)
          : undefined,
      travelExpenses: validatedTravelExpenses,
      reason: reason.value.trim().length > 0 ? reason.value.trim() : null,
    };

    isSubmitting.value = true;
    try {
      await updatePricing({ id: orderId, overrides: payload });
      notifySuccess(
        isFinalized.value
          ? 'Liquidación técnica recalculada y actualizada exitosamente.'
          : 'Tarifas de la orden configuradas exitosamente.',
      );
      showPricingModal.value = false;
      onSaved?.();
    } catch (err) {
      notifyError(err, 'Error al actualizar tarifas de la orden');
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    showPricingModal,
    isSubmitting,
    showAllServices,
    rates,
    travelExpenses,
    reason,
    isFinalized,
    distinctOrderServices,
    displayedServices,
    openPricingModal,
    closePricingModal,
    resetRateToBase,
    resetTravelExpenses,
    handleSave,
    initializeFromOrder,
  };
}
