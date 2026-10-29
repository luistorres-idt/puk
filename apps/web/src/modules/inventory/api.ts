import type { InventoryEquipment, UpdateInventoryEquipment } from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';

/**
 * Fetches all active database-backed equipment records for the administration table.
 */
export async function listInventoryEquipment(): Promise<InventoryEquipment[]> {
  return (await api.get<ApiResponse<InventoryEquipment[]>>('/inventory/equipment')).data.data;
}

/**
 * Updates mutable metadata (`imei`, `brand`, `model`) for a local equipment record
 * guarded by its expected optimistic `version`.
 */
export async function updateInventoryEquipment(
  id: string,
  input: UpdateInventoryEquipment,
): Promise<InventoryEquipment> {
  return (await api.patch<ApiResponse<InventoryEquipment>>(`/inventory/equipment/${id}`, input))
    .data.data;
}

/**
 * Requests a soft-delete archive of an available, unreserved equipment record at the expected `version`.
 */
export async function deleteInventoryEquipment(id: string, version: number): Promise<void> {
  await api.delete(`/inventory/equipment/${id}`, { data: { version } });
}
