import type { ExternalClient, ExternalEquipment } from '@puk/contracts';
import { api } from '../../shared/http/client.js';

export interface CatalogResponse<T> {
  data: T[];
  meta: {
    requestId: string;
    fetchedAt: string;
    total: number;
  };
}

export async function fetchClients(search?: string): Promise<{
  clients: ExternalClient[];
  fetchedAt: string;
}> {
  const response = await api.get<CatalogResponse<ExternalClient>>('/external/clients', {
    params: search ? { search } : undefined,
  });
  return {
    clients: response.data.data,
    fetchedAt: response.data.meta.fetchedAt,
  };
}

export async function fetchEquipment(search?: string): Promise<{
  equipment: ExternalEquipment[];
  fetchedAt: string;
}> {
  const response = await api.get<CatalogResponse<ExternalEquipment>>('/external/equipment', {
    params: search ? { search } : undefined,
  });
  return {
    equipment: response.data.data,
    fetchedAt: response.data.meta.fetchedAt,
  };
}

export async function refreshCatalogs(): Promise<void> {
  await api.post('/external/refresh');
}
