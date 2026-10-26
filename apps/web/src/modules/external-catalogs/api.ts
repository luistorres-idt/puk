import type {
  CatalogMetadata,
  ExternalClient,
  ExternalEquipment,
  RegisterEquipment,
} from '@puk/contracts';
import { api } from '../../shared/http/client.js';

export interface CatalogResponse<T> {
  data: T[];
  meta: CatalogMetadata & {
    requestId: string;
    registrationAllowed?: boolean;
    warnings?: string[];
  };
}

export async function fetchClients(search?: string): Promise<{
  clients: ExternalClient[];
  fetchedAt: string;
  sheetsAvailable: boolean;
}> {
  const response = await api.get<CatalogResponse<ExternalClient>>('/external/clients', {
    params: search ? { search } : undefined,
  });
  return {
    clients: response.data.data,
    fetchedAt: response.data.meta.fetchedAt,
    sheetsAvailable: response.data.meta.sheetsAvailable ?? true,
  };
}

export async function fetchEquipment(search?: string): Promise<{
  equipment: ExternalEquipment[];
  fetchedAt: string;
  registrationAllowed: boolean;
  warnings: string[];
}> {
  const response = await api.get<CatalogResponse<ExternalEquipment>>('/external/equipment', {
    params: search ? { search } : undefined,
  });
  return {
    equipment: response.data.data,
    registrationAllowed: response.data.meta.registrationAllowed ?? true,
    warnings: response.data.meta.warnings ?? [],
    fetchedAt: response.data.meta.fetchedAt,
  };
}

export async function refreshCatalogs(): Promise<void> {
  await api.post('/external/refresh');
}

export async function registerEquipment(input: RegisterEquipment): Promise<ExternalEquipment> {
  const response = await api.post<{ data: ExternalEquipment }>('/inventory/equipment', input);
  return response.data.data;
}
