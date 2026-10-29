import { computed, ref } from 'vue';
import { safeParse } from 'valibot';
import { UpdateInventoryEquipmentSchema, type InventoryEquipment } from '@puk/contracts';
import { extractApiErrorMessage } from '@/shared/http/client.js';
import * as inventoryApi from './api.js';

/**
 * Reactive state and actions for the administrative equipment inventory view.
 * Manages local in-memory search/filtering, active row selection, and serialized
 * optimistic-locked mutations (`update`, `remove`).
 */
export function useInventory() {
  const equipment = ref<InventoryEquipment[]>([]);
  const search = ref('');
  const state = ref('');
  const selectedId = ref<string | null>(null);
  const selected = computed(() => equipment.value.find((item) => item.id === selectedId.value));
  const filtered = computed(() => {
    const term = search.value.trim().toLocaleLowerCase();
    return equipment.value.filter(
      (item) =>
        (!state.value || item.state === state.value) &&
        (!term ||
          [
            item.imei,
            item.brand,
            item.model,
            item.currentClientName,
            item.unitLabel,
            item.unitSerialNumber,
          ].some((value) => value?.toLocaleLowerCase().includes(term))),
    );
  });
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const formError = ref<string | null>(null);

  /**
   * Reloads the equipment list from the API and clears stale selection if the selected record
   * was archived or removed by another administrator.
   */
  async function load(): Promise<void> {
    if (loading.value || saving.value) return;
    loading.value = true;
    error.value = null;
    try {
      equipment.value = await inventoryApi.listInventoryEquipment();
      if (!equipment.value.some((item) => item.id === selectedId.value)) selectedId.value = null;
      formError.value = null;
    } catch (err) {
      error.value = extractApiErrorMessage(err, 'No se pudieron cargar los equipos.');
    } finally {
      loading.value = false;
    }
  }

  /**
   * Serializes a write operation while preventing concurrent loads/saves and mapping API
   * failures into `formError`.
   */
  async function mutate(work: () => Promise<void>): Promise<boolean> {
    if (saving.value || loading.value) return false;
    saving.value = true;
    formError.value = null;
    try {
      await work();
      return true;
    } catch (err) {
      formError.value = extractApiErrorMessage(
        err,
        'No se pudo guardar el cambio. Actualiza la lista y reintenta.',
      );
      return false;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Validates and submits an optimistic-locked metadata edit, replacing the updated record
   * in the local list on success.
   */
  async function update(
    item: InventoryEquipment,
    imei: string,
    brand: string,
    model: string,
  ): Promise<boolean> {
    const parsed = safeParse(UpdateInventoryEquipmentSchema, {
      imei,
      brand,
      model,
      version: item.version,
    });
    if (!parsed.success) {
      formError.value =
        'Ingresa un IMEI de 15 dígitos, marca y modelo de entre 1 y 200 caracteres.';
      return false;
    }
    return mutate(async () => {
      const saved = await inventoryApi.updateInventoryEquipment(item.id, parsed.output);
      const index = equipment.value.findIndex((entry) => entry.id === item.id);
      if (index >= 0) equipment.value[index] = saved;
    });
  }

  /**
   * Archives an eligible (`canDelete`) equipment record and removes it from the local table.
   */
  async function remove(item: InventoryEquipment): Promise<boolean> {
    if (!item.canDelete) return false;
    return mutate(async () => {
      await inventoryApi.deleteInventoryEquipment(item.id, item.version);
      equipment.value = equipment.value.filter((entry) => entry.id !== item.id);
      if (selectedId.value === item.id) selectedId.value = null;
    });
  }
  return {
    equipment,
    search,
    state,
    selectedId,
    selected,
    filtered,
    loading,
    saving,
    error,
    formError,
    load,
    update,
    remove,
  };
}
