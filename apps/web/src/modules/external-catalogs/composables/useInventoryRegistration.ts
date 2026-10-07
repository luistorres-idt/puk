import { computed, ref } from 'vue';
import * as v from 'valibot';
import {
  initialEquipmentState,
  RegisterEquipmentSchema,
  type ExternalEquipment,
  type OrderServiceType,
  type RegisterEquipment,
} from '@puk/contracts';
import { generateUuid } from '@/shared/utils/uuid.js';

export interface RegistrationContext {
  canRegister: boolean;
  registrationAllowed: boolean;
  serviceType?: OrderServiceType | string | null | undefined;
  replacementRole?: 'OLD' | 'NEW' | undefined;
  clientSheetId?: string | null | undefined;
  clientName?: string | null | undefined;
  unit?:
    | { label: string; makeModel: string; serialNumber: string; year?: number | null | undefined }
    | undefined;
}

export function useInventoryRegistration(
  getContext: () => RegistrationContext,
  register: (input: RegisterEquipment) => Promise<ExternalEquipment>,
  onCreated: (equipment: ExternalEquipment) => void | Promise<void>,
  uuid = generateUuid,
) {
  const showForm = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const existingKeys = ref<string[]>([]);
  const replacementRole = ref<'OLD' | 'NEW' | null>(null);
  const form = ref({
    brand: '',
    model: '',
    imei: '',
    label: '',
    makeModel: '',
    serialNumber: '',
    year: null as number | null,
  });
  const state = computed(() =>
    initialEquipmentState(
      getContext().serviceType as OrderServiceType,
      getContext().replacementRole ?? replacementRole.value ?? undefined,
    ),
  );
  let retry: { fingerprint: string; key: string } | undefined;

  function open() {
    showForm.value = true;
    const unit = getContext().unit;
    if (unit && !form.value.serialNumber) {
      form.value.label = unit.label;
      form.value.makeModel = unit.makeModel;
      form.value.serialNumber = unit.serialNumber;
      form.value.year = unit.year ?? null;
    }
  }
  async function save() {
    if (saving.value) return;
    const context = getContext();
    error.value = null;
    existingKeys.value = [];
    if (!context.canRegister) {
      error.value = 'Solo un administrador puede registrar equipos.';
      return;
    }
    if (!context.registrationAllowed) {
      error.value =
        'El registro está pausado hasta recuperar Google Sheets. Los datos se conservaron.';
      return;
    }
    const candidate = {
      brand: form.value.brand,
      model: form.value.model,
      imei: form.value.imei,
      serviceType: context.serviceType,
      replacementRole: context.replacementRole ?? replacementRole.value ?? undefined,
      clientSheetId: context.clientSheetId,
      clientName: context.clientName,
      ...(state.value === 'INSTALLED'
        ? {
            unit: {
              label: form.value.label,
              makeModel: form.value.makeModel,
              serialNumber: form.value.serialNumber,
              year: form.value.year,
            },
          }
        : {}),
    };
    const fingerprint = JSON.stringify(candidate);
    if (retry?.fingerprint !== fingerprint) retry = { fingerprint, key: uuid() };
    const parsed = v.safeParse(RegisterEquipmentSchema, {
      ...candidate,
      registrationKey: retry.key,
    });
    if (!parsed.success) {
      error.value = parsed.issues[0]?.message ?? 'Completa los datos obligatorios.';
      return;
    }
    saving.value = true;
    try {
      const equipment = await register(parsed.output);
      // Registration is committed independently; a later order/service change cannot rewrite it.
      await onCreated(equipment);
      showForm.value = false;
      form.value = {
        brand: '',
        model: '',
        imei: '',
        label: '',
        makeModel: '',
        serialNumber: '',
        year: null,
      };
      retry = undefined;
    } catch (cause) {
      const details = (
        cause as {
          response?: {
            data?: {
              error?: { code?: string; message?: string; details?: { existingKeys?: string[] } };
            };
          };
        }
      )?.response?.data?.error;
      error.value =
        details?.message ?? 'No se pudo confirmar el registro. Conserva los datos y reintenta.';
      existingKeys.value = details?.details?.existingKeys ?? [];
    } finally {
      saving.value = false;
    }
  }
  return { showForm, saving, error, existingKeys, form, state, replacementRole, open, save };
}
