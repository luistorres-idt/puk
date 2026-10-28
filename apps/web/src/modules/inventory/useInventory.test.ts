import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryEquipment } from '@puk/contracts';
import * as inventoryApi from './api.js';
import { useInventory } from './useInventory.js';
vi.mock('./api.js', () => ({
  listInventoryEquipment: vi.fn(),
  updateInventoryEquipment: vi.fn(),
  deleteInventoryEquipment: vi.fn(),
}));
const item: InventoryEquipment = {
  id: 'id',
  imei: '012345678901234',
  brand: 'GPS',
  model: 'Model',
  state: 'AVAILABLE',
  currentClientSheetId: null,
  currentClientName: null,
  unitLabel: null,
  unitMakeModel: null,
  unitSerialNumber: null,
  unitYear: null,
  reservedOrderId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  canDelete: true,
};
describe('inventory management state', () => {
  beforeEach(() => vi.resetAllMocks());
  it('loads and combines case-insensitive search with physical state filters', async () => {
    vi.mocked(inventoryApi.listInventoryEquipment).mockResolvedValue([
      item,
      {
        ...item,
        id: 'installed',
        imei: '999999999999999',
        currentClientName: 'Client',
        unitLabel: 'Truck',
        unitSerialNumber: 'SERIAL',
        state: 'INSTALLED',
        canDelete: false,
      },
    ]);
    const state = useInventory();
    await state.load();
    expect(state.equipment.value).toHaveLength(2);
    state.search.value = ' client ';
    expect(state.filtered.value.map((entry) => entry.id)).toEqual(['installed']);
    state.state.value = 'AVAILABLE';
    expect(state.filtered.value).toEqual([]);
    state.state.value = '';
    state.search.value = 'serial';
    expect(state.filtered.value).toHaveLength(1);
    state.search.value = '0123';
    expect(state.filtered.value.map((entry) => entry.id)).toEqual(['id']);
  });
  it('updates trimmed metadata using displayed version and replaces local version', async () => {
    const state = useInventory();
    state.equipment.value = [item];
    vi.mocked(inventoryApi.updateInventoryEquipment).mockResolvedValue({
      ...item,
      brand: 'New',
      version: 2,
    });
    expect(await state.update(item, '012345678901234', ' New ', ' Model ')).toBe(true);
    expect(inventoryApi.updateInventoryEquipment).toHaveBeenCalledWith(item.id, {
      imei: '012345678901234',
      brand: 'New',
      model: 'Model',
      version: 1,
    });
    expect(state.equipment.value[0]?.version).toBe(2);
  });
  it('does not change local data after conflicts and surfaces server feedback', async () => {
    const state = useInventory();
    state.equipment.value = [item];
    vi.mocked(inventoryApi.updateInventoryEquipment).mockRejectedValue(
      new Error('El equipo cambió.'),
    );
    expect(await state.update(item, item.imei, 'A', 'B')).toBe(false);
    expect(state.formError.value).toBe('El equipo cambió.');
    expect(state.equipment.value).toEqual([item]);
    expect(state.saving.value).toBe(false);
  });
  it('validates metadata before requesting a mutation', async () => {
    const state = useInventory();
    expect(await state.update(item, '123', 'Brand', 'Model')).toBe(false);
    expect(await state.update(item, item.imei, ' ', 'Model')).toBe(false);
    expect(await state.update(item, item.imei, 'Brand', 'x'.repeat(201))).toBe(false);
    expect(inventoryApi.updateInventoryEquipment).not.toHaveBeenCalled();
  });
  it('blocks unavailable deletion locally and retains data on delete failure', async () => {
    const state = useInventory();
    state.equipment.value = [item];
    expect(await state.remove({ ...item, canDelete: false })).toBe(false);
    expect(inventoryApi.deleteInventoryEquipment).not.toHaveBeenCalled();
    vi.mocked(inventoryApi.deleteInventoryEquipment).mockRejectedValue(new Error('Reserved'));
    expect(await state.remove(item)).toBe(false);
    expect(state.equipment.value).toEqual([item]);
  });
  it('deletes with displayed version and clears the deleted selection', async () => {
    const state = useInventory();
    state.equipment.value = [item];
    state.selectedId.value = item.id;
    vi.mocked(inventoryApi.deleteInventoryEquipment).mockResolvedValue();
    expect(await state.remove(item)).toBe(true);
    expect(inventoryApi.deleteInventoryEquipment).toHaveBeenCalledWith(item.id, 1);
    expect(state.equipment.value).toEqual([]);
    expect(state.selected.value).toBeUndefined();
  });
  it('prevents duplicate submissions while saving', async () => {
    let finish!: (value: InventoryEquipment) => void;
    vi.mocked(inventoryApi.updateInventoryEquipment).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const state = useInventory();
    state.equipment.value = [item];
    const first = state.update(item, item.imei, 'A', 'B');
    expect(await state.remove(item)).toBe(false);
    expect(inventoryApi.deleteInventoryEquipment).not.toHaveBeenCalled();
    finish({ ...item, brand: 'A', model: 'B', version: 2 });
    expect(await first).toBe(true);
    expect(state.saving.value).toBe(false);
  });
  it('retains existing data when a reload fails and allows retry', async () => {
    const state = useInventory();
    state.equipment.value = [item];
    vi.mocked(inventoryApi.listInventoryEquipment)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce([]);
    await state.load();
    expect(state.loading.value).toBe(false);
    expect(state.error.value).toBe('Offline');
    expect(state.equipment.value).toEqual([item]);
    await state.load();
    expect(state.error.value).toBeNull();
    expect(state.equipment.value).toEqual([]);
  });
});
