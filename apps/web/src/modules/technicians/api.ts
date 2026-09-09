import { api } from '../../shared/http/client.js';
import type { TechnicianOption } from '@puk/contracts';

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

export async function listSelectableTechnicians(): Promise<TechnicianOption[]> {
  const response = await api.get<ApiResponse<TechnicianOption[]>>('/technicians/selectable');
  return response.data.data;
}
