import type {
  Client,
  ClientEmail,
  CreateClient,
  SaveClientEmail,
  UpdateClient,
} from '@puk/contracts';
import { api, type ApiResponse } from '@/shared/http/client.js';

export async function listClients(): Promise<Client[]> {
  return (await api.get<ApiResponse<Client[]>>('/clients')).data.data;
}
export async function getClient(id: string): Promise<Client> {
  return (await api.get<ApiResponse<Client>>(`/clients/${id}`)).data.data;
}
export async function createClient(input: CreateClient): Promise<Client> {
  return (await api.post<ApiResponse<Client>>('/clients', input)).data.data;
}
export async function updateClient(id: string, input: UpdateClient): Promise<Client> {
  return (await api.patch<ApiResponse<Client>>(`/clients/${id}`, input)).data.data;
}
export async function addClientEmail(id: string, input: SaveClientEmail): Promise<ClientEmail> {
  return (await api.post<ApiResponse<ClientEmail>>(`/clients/${id}/emails`, input)).data.data;
}
export async function updateClientEmail(
  id: string,
  emailId: string,
  input: SaveClientEmail,
): Promise<ClientEmail> {
  return (await api.patch<ApiResponse<ClientEmail>>(`/clients/${id}/emails/${emailId}`, input)).data
    .data;
}
export async function deleteClientEmail(id: string, emailId: string): Promise<void> {
  await api.delete(`/clients/${id}/emails/${emailId}`);
}
