import type { SyncStatus, UpdateTechnicalReportSyncSchedule } from '@puk/contracts';

import { api } from '@/shared/http/client.js';

interface ApiResponse<T> {
  data: T;
}

export interface SyncOperationItem {
  attempts: number;
  createdAt: string;
  id: string;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextAttemptAt: string | null;
  operationType: string;
  orderId: string | null;
  scheduledFor: string | null;
  status: SyncStatus;
  syncedAt: string | null;
  updatedAt: string;
  order: {
    clientNameSnapshot: string;
    folio: string;
    technicianNameSnapshot: string | null;
  } | null;
}

export interface SyncSchedule extends UpdateTechnicalReportSyncSchedule {
  nextSyncAt: string;
  updatedAt: string | null;
}

export interface SyncOperationsResult {
  operations: SyncOperationItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: Partial<Record<SyncStatus, number>>;
}

export async function fetchSyncOperations(params: {
  operationType?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}): Promise<SyncOperationsResult> {
  const response = await api.get<ApiResponse<SyncOperationsResult>>('/sync', { params });
  return response.data.data;
}

export async function fetchSyncSchedule(): Promise<SyncSchedule> {
  const response = await api.get<ApiResponse<SyncSchedule>>('/sync/schedule');
  return response.data.data;
}

export async function updateSyncSchedule(
  input: UpdateTechnicalReportSyncSchedule,
): Promise<SyncSchedule> {
  const response = await api.put<ApiResponse<SyncSchedule>>('/sync/schedule', input);
  return response.data.data;
}

export async function retrySyncOperation(id: string): Promise<void> {
  await api.post(`/sync/${id}/retry`);
}
