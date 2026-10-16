import { computed, ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  MAX_CLIENT_NAME_SNAPSHOT_LENGTH,
  MAX_ORDER_NOTES_LENGTH,
  MAX_ORDER_UNIT_LABEL_LENGTH,
  MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
  MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
  MAX_SERVICE_ADDRESS_LENGTH,
} from '@puk/contracts';
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
  createOrder: (payload: CreateOrder, idempotencyKey: string) => Promise<{ id: string }>;
  navigate: (path: string) => void | Promise<unknown>;
}

const PENDING_ORDER_CREATION_STORAGE_KEY = 'puk:orders:create:pending';

function readPendingOrderCreation(): { payloadHash: string; key: string } | null {
  try {
    const stored = sessionStorage.getItem(PENDING_ORDER_CREATION_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'payloadHash' in parsed &&
      typeof parsed.payloadHash === 'string' &&
      'key' in parsed &&
      typeof parsed.key === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.key) &&
      /^[0-9a-f]{64}$/.test(parsed.payloadHash)
    ) {
      return { payloadHash: parsed.payloadHash, key: parsed.key };
    }
  } catch {
    // Storage can be disabled; in-memory retries still retain the key.
  }
  return null;
}

function writePendingOrderCreation(value: { payloadHash: string; key: string } | null): void {
  try {
    if (value) sessionStorage.setItem(PENDING_ORDER_CREATION_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_ORDER_CREATION_STORAGE_KEY);
  } catch {
    // Storage can be disabled; in-memory retries still retain the key.
  }
}

async function hashOrderCreationPayload(payload: CreateOrder): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  let pendingCreation = readPendingOrderCreation();
  const hasValidTechnician = computed(() =>
    Boolean(state.technicianId.value && state.selectedTechnician.value),
  );

  async function handleFinish() {
    if (loading.value) return;
    if (!state.selectedClientId.value || !state.selectedClient.value) return;

    if (
      state.configuredUnits.value.some(
        (unit) => unit.label.trim().length > MAX_ORDER_UNIT_LABEL_LENGTH,
      )
    ) {
      state.error.value = `La etiqueta de la unidad no puede superar ${MAX_ORDER_UNIT_LABEL_LENGTH} caracteres.`;
      state.currentStep.value = 2;
      return;
    }

    if (
      state.configuredUnits.value.some(
        (unit) => unit.serialNumber.trim().length > MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH,
      )
    ) {
      state.error.value = `El número de serie no puede superar ${MAX_ORDER_UNIT_SERIAL_NUMBER_LENGTH} caracteres.`;
      state.currentStep.value = 2;
      return;
    }

    if (
      state.configuredUnits.value.some(
        (unit) => unit.makeModel.trim().length > MAX_ORDER_UNIT_MAKE_MODEL_LENGTH,
      )
    ) {
      state.error.value = `La marca/modelo de la unidad no puede superar ${MAX_ORDER_UNIT_MAKE_MODEL_LENGTH} caracteres.`;
      state.currentStep.value = 2;
      return;
    }

    if (state.generalNotes.value.length > MAX_ORDER_NOTES_LENGTH) {
      state.error.value = `Las notas no pueden superar ${MAX_ORDER_NOTES_LENGTH.toLocaleString('es-MX')} caracteres.`;
      return;
    }

    if (state.serviceAddress.value.trim().length > MAX_SERVICE_ADDRESS_LENGTH) {
      state.error.value = `La dirección del servicio no puede superar ${MAX_SERVICE_ADDRESS_LENGTH.toLocaleString('es-MX')} caracteres.`;
      return;
    }

    const clientNameSnapshot = state.selectedClient.value.name.trim();
    if (clientNameSnapshot.length > MAX_CLIENT_NAME_SNAPSHOT_LENGTH) {
      state.error.value = `El nombre del cliente no puede superar ${MAX_CLIENT_NAME_SNAPSHOT_LENGTH.toLocaleString('es-MX')} caracteres.`;
      return;
    }

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
      const payload: CreateOrder = {
        clientSheetId: state.selectedClientId.value,
        clientNameSnapshot,
        serviceType: primaryService,
        scheduledAt: new Date(state.scheduledAtTimestamp.value).toISOString(),
        isHomeService: state.isHomeService.value,
        serviceAddress: state.serviceAddress.value.trim() || null,
        generalNotes: state.generalNotes.value || null,
        technicianId: technician.id,
        units: units.length > 0 ? units : undefined,
      };
      const payloadHash = await hashOrderCreationPayload(payload);
      if (!pendingCreation || pendingCreation.payloadHash !== payloadHash) {
        pendingCreation = { payloadHash, key: crypto.randomUUID() };
        writePendingOrderCreation(pendingCreation);
      }
      const idempotencyKey = pendingCreation.key;
      const created = await requestOrderCreation(payload, idempotencyKey);
      if (pendingCreation?.key === idempotencyKey) {
        pendingCreation = null;
        writePendingOrderCreation(null);
      }

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
