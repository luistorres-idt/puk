import { api } from '../../shared/http/client.js';

export interface Technician {
  active: boolean;
  address?: string | null;
  city?: string | null;
  id: string;
  name: string;
  phone?: string | null;
  state?: string | null;
  workshop?: string | null;
}

export interface ApiResponse<T> {
  data: T;
}

export async function listTechnicians(): Promise<Technician[]> {
  const response = await api.get<ApiResponse<Technician[]>>('/technicians');
  return response.data.data;
}

export async function listActiveTechnicians(): Promise<Technician[]> {
  const technicians = await listTechnicians();
  return technicians.filter((t) => t.active);
}
