import type {
  AdminUserListItem,
  CreateUser,
  SharedTechnicianAccessConfig,
  UpdateSharedTechnicianAccessAccount,
  UpdateSharedTechnicianAccessOrder,
  UpdateUser,
} from '@puk/contracts';
import { api, type ApiResponse } from '../../shared/http/client.js';

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

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  const response = await api.get<ApiResponse<AdminUserListItem[]>>('/users');
  return response.data.data;
}

export async function createAdminUser(data: CreateUser): Promise<AdminUserListItem> {
  const response = await api.post<ApiResponse<AdminUserListItem>>('/users', data);
  return response.data.data;
}

export async function updateAdminUser(id: string, data: UpdateUser): Promise<AdminUserListItem> {
  const response = await api.patch<ApiResponse<AdminUserListItem>>(`/users/${id}`, data);
  return response.data.data;
}
