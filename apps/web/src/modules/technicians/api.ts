import { api } from '../../shared/http/client.js';
import type { CreateTechnician, TechnicianOption, UpdateTechnician } from '@puk/contracts';

export interface Technician {
  active: boolean;
  address?: string | null;
  city?: string | null;
  departureCost?: string | number | null;
  email?: string | null;
  externalKey?: string | null;
  failedAppointmentRate?: string | number | null;
  fuelSensorRate?: string | number | null;
  id: string;
  installationRate?: string | number | null;
  invoice?: string | null;
  legalName?: string | null;
  name: string;
  notes?: string | null;
  phone?: string | null;
  replacementRate?: string | number | null;
  reviewRate?: string | number | null;
  state?: string | null;
  taxAddress?: string | null;
  taxData?: string | null;
  uninstallationRate?: string | number | null;
  workshop?: string | null;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ImportTechniciansResult {
  synced: number;
  deactivated: number;
  maxExternalId?: string | null;
  message?: string;
}

export async function listTechnicians(): Promise<Technician[]> {
  const response = await api.get<ApiResponse<Technician[]>>('/technicians');
  return response.data.data;
}

export async function createTechnician(input: CreateTechnician): Promise<Technician> {
  const response = await api.post<ApiResponse<Technician>>('/technicians', input);
  return response.data.data;
}

export async function updateTechnician(id: string, input: UpdateTechnician): Promise<Technician> {
  const response = await api.patch<ApiResponse<Technician>>(`/technicians/${id}`, input);
  return response.data.data;
}

export async function importTechniciansFromSheets(): Promise<ImportTechniciansResult> {
  const response = await api.post<ApiResponse<ImportTechniciansResult>>('/technicians/sync');
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
