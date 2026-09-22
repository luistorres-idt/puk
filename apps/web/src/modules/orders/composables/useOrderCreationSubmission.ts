import { computed, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  CreateOrder,
  ExternalClient,
  ExternalEquipment,
  OrderServiceType,
  TechnicianOption,
} from '@puk/contracts';
import { toEquipmentAssignment } from '../../external-catalogs/index.js';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import { createOrder } from '../api.js';
import type { ConfiguredUnitItem } from './configured-order-unit.js';

interface OrderCreationSubmissionState {
  activeServiceType: Ref<OrderServiceType>;
  configuredUnits: Ref<ConfiguredUnitItem[]>;
  currentStep: Ref<number>;
  error: Ref<string | null>;
  generalNotes: Ref<string>;
  isHomeService: Ref<boolean>;
  scheduledAtTimestamp: Ref<number>;
  selectedClient: Ref<ExternalClient | null>;
  selectedClientId: Ref<string | null>;
  selectedTechnician: Ref<TechnicianOption | null>;
  serviceAddress: Ref<string>;
  technicianId: Ref<string | null>;
}

interface OrderCreationSubmissionDependencies {
  createOrder: (payload: CreateOrder) => Promise<{ id: string }>;
  navigate: (path: string) => void | Promise<unknown>;
}

function buildUnitsPayload(configuredUnits: ConfiguredUnitItem[]) {
  return configuredUnits.map((unit) => {
    const equipment = [unit.equipment, unit.replacementEquipment]
      .filter((item): item is ExternalEquipment => Boolean(item))
      .map(toEquipmentAssignment);

    return {
      label: unit.label.trim(),
      makeModel: unit.makeModel.trim(),
      serialNumber: unit.serialNumber.trim(),
      year: unit.year,
      serviceType: unit.serviceType,
      equipment: equipment.length > 0 ? equipment : undefined,
    };
  });
}

export function useOrderCreationSubmission(
  state: OrderCreationSubmissionState,
  dependencies?: Partial<OrderCreationSubmissionDependencies>,
) {
  const router = dependencies?.navigate ? null : useRouter();
  const requestOrderCreation = dependencies?.createOrder ?? createOrder;
  const navigate = dependencies?.navigate ?? ((path: string) => router!.push(path));
  const loading = ref(false);
  const hasValidTechnician = computed(() =>
    Boolean(state.technicianId.value && state.selectedTechnician.value),
  );

  async function handleFinish() {
    if (loading.value) return;
    if (!state.selectedClientId.value || !state.selectedClient.value) return;

    const technician = state.selectedTechnician.value;
    if (!hasValidTechnician.value || !technician) {
      state.error.value = 'Selecciona un técnico válido antes de crear la orden.';
      state.currentStep.value = 4;
      return;
    }

    loading.value = true;
    state.error.value = null;

    try {
      const units = buildUnitsPayload(state.configuredUnits.value);
      const primaryService =
        state.configuredUnits.value[0]?.serviceType ?? state.activeServiceType.value;
      const created = await requestOrderCreation({
        clientSheetId: state.selectedClientId.value,
        clientNameSnapshot: state.selectedClient.value.name,
        serviceType: primaryService,
        scheduledAt: new Date(state.scheduledAtTimestamp.value).toISOString(),
        isHomeService: state.isHomeService.value,
        serviceAddress: state.serviceAddress.value || null,
        generalNotes: state.generalNotes.value || null,
        technicianId: technician.id,
        units: units.length > 0 ? units : undefined,
      });

      navigate(`/orders/${created.id}`);
    } catch (err: unknown) {
      state.error.value = extractApiErrorMessage(err, 'Error al crear la orden de servicio');
    } finally {
      loading.value = false;
    }
  }

  return {
    handleFinish,
    hasValidTechnician,
    loading,
  };
}
