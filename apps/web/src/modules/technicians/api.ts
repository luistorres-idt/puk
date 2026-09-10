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

export interface SelectableTechniciansResult {
  technicians: TechnicianOption[];
  fetchedAt: string | null;
  total: number;
}

export async function fetchSelectableTechnicians(
  options: { forceFresh?: boolean } = {},
): Promise<SelectableTechniciansResult> {
  const response = await api.get<{
    data: TechnicianOption[];
    meta?: { fetchedAt?: string; total?: number };
  }>('/technicians/selectable', {
    params: options.forceFresh ? { fresh: 'true' } : undefined,
  });
  return {
    technicians: response.data.data,
    fetchedAt: response.data.meta?.fetchedAt ?? null,
    total: response.data.meta?.total ?? response.data.data.length,
  };
}

export async function listSelectableTechnicians(forceFresh = false): Promise<TechnicianOption[]> {
  const { technicians } = await fetchSelectableTechnicians({ forceFresh });
  return technicians;
}
