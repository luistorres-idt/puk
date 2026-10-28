import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/http/client.js';
import {
  deleteInventoryEquipment,
  listInventoryEquipment,
  updateInventoryEquipment,
} from './api.js';
vi.mock('@/shared/http/client.js', () => ({
  api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
describe('inventory management API', () => {
  beforeEach(() => vi.resetAllMocks());
  it('uses the local inventory endpoint, not the hybrid catalog', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [{ id: 'id' }] } } as never);
    expect(await listInventoryEquipment()).toEqual([{ id: 'id' }]);
    expect(api.get).toHaveBeenCalledWith('/inventory/equipment');
  });
  it('sends the editable equipment identity and metadata with concurrency version', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { data: { id: 'id' } } } as never);
    await updateInventoryEquipment('id', {
      imei: '012345678901234',
      brand: 'GPS',
      model: 'Model',
      version: 2,
    });
    await deleteInventoryEquipment('id', 3);
    expect(api.patch).toHaveBeenCalledWith('/inventory/equipment/id', {
      imei: '012345678901234',
      brand: 'GPS',
      model: 'Model',
      version: 2,
    });
    expect(api.delete).toHaveBeenCalledWith('/inventory/equipment/id', { data: { version: 3 } });
  });
});
