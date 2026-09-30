import type { AdminUserListItem, CreateUser, UpdateUser } from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';

export async function listUsers(): Promise<AdminUserListItem[]> {
  const response = await api.get<ApiResponse<AdminUserListItem[]>>('/users');
  return response.data.data;
}

export async function createUser(data: CreateUser): Promise<AdminUserListItem> {
  const response = await api.post<ApiResponse<AdminUserListItem>>('/users', data);
  return response.data.data;
}

export async function updateUser(id: string, data: UpdateUser): Promise<AdminUserListItem> {
  const response = await api.patch<ApiResponse<AdminUserListItem>>(`/users/${id}`, data);
  return response.data.data;
}
