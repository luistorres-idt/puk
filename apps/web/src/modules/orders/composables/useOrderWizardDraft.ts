import { ref, watch, type Ref } from 'vue';
import type {
  ExternalClient,
  OrderServiceType,
  TechnicianOption,
} from '@puk/contracts';
import type { ConfiguredUnitItem } from './configured-order-unit.js';

export const ORDER_WIZARD_DRAFT_STORAGE_KEY = 'puk:orders:create:draft';
export const ORDER_WIZARD_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface OrderWizardDraftData {
  activeServiceType?: OrderServiceType;
  configuredUnits?: ConfiguredUnitItem[];
  currentStep?: number;
  generalNotes?: string;
  isHomeService?: boolean;
  savedAt: number;
  scheduledAtTimestamp?: number;
  selectedClient?: ExternalClient | null;
  selectedClientId?: string | null;
  selectedTechnician?: TechnicianOption | null;
  serviceAddress?: string;
  technicianId?: string | null;
}

export interface OrderWizardDraftRefs {
  activeServiceType: Ref<OrderServiceType>;
  configuredUnits: Ref<ConfiguredUnitItem[]>;
  currentStep: Ref<number>;
  generalNotes: Ref<string>;
  isHomeService: Ref<boolean>;
  scheduledAtTimestamp: Ref<number>;
  selectedClient: Ref<ExternalClient | null>;
  selectedClientId: Ref<string | null>;
  selectedTechnician: Ref<TechnicianOption | null>;
  serviceAddress: Ref<string>;
  technicianId: Ref<string | null>;
}

export interface OrderWizardDraftStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function resolveStorage(): OrderWizardDraftStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearOrderWizardDraft(customStorage?: OrderWizardDraftStorage | null): void {
  const storage = customStorage === undefined ? resolveStorage() : customStorage;
  if (!storage) return;
  try {
    storage.removeItem(ORDER_WIZARD_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability
  }
}

export function readOrderWizardDraft(
  customStorage?: OrderWizardDraftStorage | null,
): OrderWizardDraftData | null {
  const storage = customStorage === undefined ? resolveStorage() : customStorage;
  if (!storage) return null;
  try {
    const raw = storage.getItem(ORDER_WIZARD_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrderWizardDraftData>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'number') {
      clearOrderWizardDraft(storage);
      return null;
    }
    if (Date.now() - parsed.savedAt > ORDER_WIZARD_DRAFT_MAX_AGE_MS) {
      clearOrderWizardDraft(storage);
      return null;
    }
    return parsed as OrderWizardDraftData;
  } catch {
    clearOrderWizardDraft(storage);
    return null;
  }
}

export function writeOrderWizardDraft(
  data: OrderWizardDraftData,
  customStorage?: OrderWizardDraftStorage | null,
): void {
  const storage = customStorage === undefined ? resolveStorage() : customStorage;
  if (!storage) return;
  try {
    storage.setItem(ORDER_WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota or disabled storage
  }
}

export function useOrderWizardDraft(
  refs: OrderWizardDraftRefs,
  customStorage?: OrderWizardDraftStorage | null,
) {
  const storage = customStorage === undefined ? resolveStorage() : customStorage;
  const hasRestoredDraft = ref(false);

  function saveCurrentDraft(): void {
    if (!storage) return;
    const hasData =
      Boolean(refs.selectedClientId.value) ||
      refs.configuredUnits.value.length > 0 ||
      Boolean(refs.serviceAddress.value.trim()) ||
      Boolean(refs.generalNotes.value.trim()) ||
      Boolean(refs.technicianId.value);

    if (!hasData) {
      clearOrderWizardDraft(storage);
      return;
    }

    const draft: OrderWizardDraftData = {
      activeServiceType: refs.activeServiceType.value,
      configuredUnits: refs.configuredUnits.value,
      currentStep: refs.currentStep.value,
      generalNotes: refs.generalNotes.value,
      isHomeService: refs.isHomeService.value,
      savedAt: Date.now(),
      scheduledAtTimestamp: refs.scheduledAtTimestamp.value,
      selectedClient: refs.selectedClient.value,
      selectedClientId: refs.selectedClientId.value,
      selectedTechnician: refs.selectedTechnician.value,
      serviceAddress: refs.serviceAddress.value,
      technicianId: refs.technicianId.value,
    };
    writeOrderWizardDraft(draft, storage);
  }

  function restoreDraft(): boolean {
    const draft = readOrderWizardDraft(storage);
    if (!draft) return false;

    if (draft.selectedClientId !== undefined) refs.selectedClientId.value = draft.selectedClientId;
    if (draft.selectedClient !== undefined) refs.selectedClient.value = draft.selectedClient;
    if (Array.isArray(draft.configuredUnits) && draft.configuredUnits.length > 0) {
      refs.configuredUnits.value = draft.configuredUnits;
    }
    if (draft.activeServiceType !== undefined) {
      refs.activeServiceType.value = draft.activeServiceType;
    }
    if (typeof draft.scheduledAtTimestamp === 'number') {
      refs.scheduledAtTimestamp.value = draft.scheduledAtTimestamp;
    }
    if (typeof draft.isHomeService === 'boolean') {
      refs.isHomeService.value = draft.isHomeService;
    }
    if (typeof draft.serviceAddress === 'string') {
      refs.serviceAddress.value = draft.serviceAddress;
    }
    if (typeof draft.generalNotes === 'string') {
      refs.generalNotes.value = draft.generalNotes;
    }
    if (draft.technicianId !== undefined) refs.technicianId.value = draft.technicianId;
    if (draft.selectedTechnician !== undefined) {
      refs.selectedTechnician.value = draft.selectedTechnician;
    }
    if (typeof draft.currentStep === 'number' && draft.currentStep >= 1 && draft.currentStep <= 5) {
      refs.currentStep.value = draft.currentStep;
    }

    hasRestoredDraft.value = true;
    return true;
  }

  function clearDraft(): void {
    clearOrderWizardDraft(storage);
    hasRestoredDraft.value = false;
  }

  // Restore on composable initialization
  restoreDraft();

  // Watch for changes to persist
  watch(
    [
      refs.currentStep,
      refs.selectedClientId,
      refs.selectedClient,
      refs.configuredUnits,
      refs.activeServiceType,
      refs.scheduledAtTimestamp,
      refs.isHomeService,
      refs.serviceAddress,
      refs.generalNotes,
      refs.technicianId,
      refs.selectedTechnician,
    ],
    () => {
      saveCurrentDraft();
    },
    { deep: true },
  );

  return {
    clearDraft,
    hasRestoredDraft,
    restoreDraft,
    saveCurrentDraft,
  };
}
