import type { InventoryEquipment, UpdateInventoryEquipment } from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';

export async function listInventoryEquipment(): Promise<InventoryEquipment[]> {
  return (await api.get<ApiResponse<InventoryEquipment[]>>('/inventory/equipment')).data.data;
}
export async function updateInventoryEquipment(
  id: string,
  input: UpdateInventoryEquipment,
): Promise<InventoryEquipment> {
  return (await api.patch<ApiResponse<InventoryEquipment>>(`/inventory/equipment/${id}`, input))
    .data.data;
}
export async function deleteInventoryEquipment(id: string, version: number): Promise<void> {
  await api.delete(`/inventory/equipment/${id}`, { data: { version } });
}
