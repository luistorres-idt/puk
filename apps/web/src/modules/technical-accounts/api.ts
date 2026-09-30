import type {
  SharedTechnicianAccessConfig,
  UpdateSharedTechnicianAccessAccount,
  UpdateSharedTechnicianAccessOrder,
} from '@puk/contracts';
import { api, type ApiResponse } from '../../shared/http/client.js';
export {
  createUser as createAdminUser,
  listUsers as listAdminUsers,
  updateUser as updateAdminUser,
} from '../user-management/api.js';

export async function getSharedTechnicianAccess(): Promise<SharedTechnicianAccessConfig> {
  const response = await api.get<ApiResponse<SharedTechnicianAccessConfig>>(
    '/shared-technician-access',
  );
  return response.data.data;
}

export async function updateSharedTechnicianAccount(
  data: UpdateSharedTechnicianAccessAccount,
): Promise<SharedTechnicianAccessConfig> {
  const response = await api.put<ApiResponse<SharedTechnicianAccessConfig>>(
    '/shared-technician-access/account',
    data,
  );
  return response.data.data;
}

export async function updateSharedTechnicianOrder(
  data: UpdateSharedTechnicianAccessOrder,
): Promise<SharedTechnicianAccessConfig> {
  const response = await api.put<ApiResponse<SharedTechnicianAccessConfig>>(
    '/shared-technician-access/order',
    data,
  );
  return response.data.data;
}
