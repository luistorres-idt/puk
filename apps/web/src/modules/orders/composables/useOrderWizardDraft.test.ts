import { ref } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExternalClient, TechnicianOption } from '@puk/contracts';

import {
  clearOrderWizardDraft,
  ORDER_WIZARD_DRAFT_MAX_AGE_MS,
  ORDER_WIZARD_DRAFT_STORAGE_KEY,
  readOrderWizardDraft,
  useOrderWizardDraft,
  type OrderWizardDraftRefs,
  type OrderWizardDraftStorage,
} from './useOrderWizardDraft';

function createMockStorage(): OrderWizardDraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function createDefaultRefs(): OrderWizardDraftRefs {
  return {
    activeServiceType: ref('INSTALLATION'),
    configuredUnits: ref([]),
    currentStep: ref(1),
    generalNotes: ref(''),
    isHomeService: ref(false),
    scheduledAtTimestamp: ref(1700000000000),
    selectedClient: ref<ExternalClient | null>(null),
    selectedClientId: ref<string | null>(null),
    selectedTechnician: ref<TechnicianOption | null>(null),
    serviceAddress: ref(''),
    technicianId: ref<string | null>(null),
  };
}

describe('useOrderWizardDraft', () => {
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it('restores nothing when storage is empty', () => {
    const refs = createDefaultRefs();
    const { hasRestoredDraft } = useOrderWizardDraft(refs, storage);

    expect(hasRestoredDraft.value).toBe(false);
    expect(refs.currentStep.value).toBe(1);
    expect(refs.selectedClientId.value).toBeNull();
  });

  it('restores draft correctly when valid data is in storage', () => {
    const mockClient: ExternalClient = {
      id: 'client-123',
      name: 'Transportes del Norte',
    };
    const savedDraft = {
      activeServiceType: 'REVIEW',
      configuredUnits: [
        {
          id: 'unit-1',
          label: 'Eco 101',
          makeModel: 'Kenworth T680',
          serialNumber: '3AKJH',
          serviceType: 'REVIEW',
        },
      ],
      currentStep: 2,
      generalNotes: 'Instalación urgente',
      isHomeService: true,
      savedAt: Date.now() - 1000,
      scheduledAtTimestamp: 1700000000000,
      selectedClient: mockClient,
      selectedClientId: 'client-123',
      selectedTechnician: null,
      serviceAddress: 'Calle Central 456',
      technicianId: null,
    };
    storage.setItem(ORDER_WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(savedDraft));

    const refs = createDefaultRefs();
    const { hasRestoredDraft } = useOrderWizardDraft(refs, storage);

    expect(hasRestoredDraft.value).toBe(true);
    expect(refs.currentStep.value).toBe(2);
    expect(refs.selectedClientId.value).toBe('client-123');
    expect(refs.selectedClient.value?.name).toBe('Transportes del Norte');
    expect(refs.configuredUnits.value).toHaveLength(1);
    expect(refs.configuredUnits.value[0]?.label).toBe('Eco 101');
    expect(refs.isHomeService.value).toBe(true);
    expect(refs.serviceAddress.value).toBe('Calle Central 456');
    expect(refs.generalNotes.value).toBe('Instalación urgente');
  });

  it('ignores and clears expired drafts older than max age', () => {
    const expiredDraft = {
      currentStep: 3,
      selectedClientId: 'client-old',
      savedAt: Date.now() - ORDER_WIZARD_DRAFT_MAX_AGE_MS - 5000,
    };
    storage.setItem(ORDER_WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(expiredDraft));

    const refs = createDefaultRefs();
    const { hasRestoredDraft } = useOrderWizardDraft(refs, storage);

    expect(hasRestoredDraft.value).toBe(false);
    expect(refs.selectedClientId.value).toBeNull();
    expect(storage.getItem(ORDER_WIZARD_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('saves draft on change when data is present', async () => {
    const refs = createDefaultRefs();
    const { saveCurrentDraft } = useOrderWizardDraft(refs, storage);

    refs.selectedClientId.value = 'client-new';
    refs.serviceAddress.value = 'Av. Reforma 100';
    saveCurrentDraft();

    const stored = readOrderWizardDraft(storage);
    expect(stored).not.toBeNull();
    expect(stored?.selectedClientId).toBe('client-new');
    expect(stored?.serviceAddress).toBe('Av. Reforma 100');
  });

  it('clears draft when clearDraft is invoked', () => {
    storage.setItem(
      ORDER_WIZARD_DRAFT_STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), currentStep: 2, selectedClientId: 'client-1' }),
    );

    const refs = createDefaultRefs();
    const { clearDraft, hasRestoredDraft } = useOrderWizardDraft(refs, storage);

    expect(hasRestoredDraft.value).toBe(true);
    clearDraft();
    expect(hasRestoredDraft.value).toBe(false);
    expect(storage.getItem(ORDER_WIZARD_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('handles corrupted JSON in storage without throwing', () => {
    storage.setItem(ORDER_WIZARD_DRAFT_STORAGE_KEY, '{invalid-json');
    const refs = createDefaultRefs();
    const { hasRestoredDraft } = useOrderWizardDraft(refs, storage);

    expect(hasRestoredDraft.value).toBe(false);
    expect(storage.getItem(ORDER_WIZARD_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('can clear draft directly via clearOrderWizardDraft helper', () => {
    storage.setItem(ORDER_WIZARD_DRAFT_STORAGE_KEY, '{"savedAt":123}');
    clearOrderWizardDraft(storage);
    expect(storage.getItem(ORDER_WIZARD_DRAFT_STORAGE_KEY)).toBeNull();
  });
});
