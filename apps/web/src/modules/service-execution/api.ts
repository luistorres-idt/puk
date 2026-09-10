import type {
  ChecklistCategory,
  CompleteEvidence,
  CompleteSignature,
  FailAppointment,
  PresignEvidence,
  PresignSignature,
  ReportDiscrepancy,
  RequireCorrection,
  SaveChecklistItem,
} from '@puk/contracts';
import { api, type ApiResponse } from '../../shared/http/client.js';

export type { ApiResponse };

export interface CompleteOrderResult extends Record<string, unknown> {
  warnings?: string[];
}

export async function startOrder(orderId: string) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(`/orders/${orderId}/start`);
  return response.data.data;
}

export async function verifyEquipment(orderId: string, unitId: string, equipmentId: string) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units/${unitId}/equipment/${equipmentId}/verify`,
  );
  return response.data.data;
}

export async function reportDiscrepancy(
  orderId: string,
  unitId: string,
  equipmentId: string,
  data: ReportDiscrepancy,
) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units/${unitId}/equipment/${equipmentId}/discrepancy`,
    data,
  );
  return response.data.data;
}

export async function saveChecklist(orderId: string, unitId: string, items: SaveChecklistItem[]) {
  const response = await api.put<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units/${unitId}/checklist`,
    { items },
  );
  return response.data.data;
}

export async function presignEvidence(
  orderId: string,
  unitId: string,
  category: ChecklistCategory,
  data: PresignEvidence,
) {
  const response = await api.post<
    ApiResponse<{ evidenceId: string; uploadUrl: string; objectKey: string }>
  >(`/orders/${orderId}/units/${unitId}/checklist/${category}/evidence/presign`, data);
  return response.data.data;
}

export async function uploadToStorage(uploadUrl: string, blob: Blob, mimeType: string) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: blob,
  });
  if (!response.ok) {
    throw new Error(`La carga del archivo falló (${response.status})`);
  }
}

export async function completeEvidence(evidenceId: string, data: CompleteEvidence) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/evidence/${evidenceId}/complete`,
    data,
  );
  return response.data.data;
}

export async function deleteEvidence(evidenceId: string) {
  const response = await api.delete<ApiResponse<Record<string, unknown>>>(
    `/evidence/${evidenceId}`,
  );
  return response.data.data;
}

export async function getEvidenceUrl(evidenceId: string) {
  const response = await api.get<ApiResponse<{ downloadUrl: string }>>(
    `/evidence/${evidenceId}/url`,
  );
  return response.data.data;
}

export async function presignSignature(orderId: string, data: PresignSignature) {
  const response = await api.post<ApiResponse<{ uploadUrl: string; objectKey: string }>>(
    `/orders/${orderId}/signature/presign`,
    data,
  );
  return response.data.data;
}

export async function completeSignature(
  orderId: string,
  data: CompleteSignature,
  objectKey: string,
) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/signature/complete`,
    data,
    { params: { objectKey } },
  );
  return response.data.data;
}

export async function getSignatureUrl(orderId: string) {
  const response = await api.get<ApiResponse<{ downloadUrl: string; signerName: string }>>(
    `/orders/${orderId}/signature/url`,
  );
  return response.data.data;
}

export async function checkCompleteness(orderId: string) {
  const response = await api.get<
    ApiResponse<{ isComplete: boolean; missingRequirements: string[] }>
  >(`/orders/${orderId}/completeness`);
  return response.data.data;
}

export async function completeOrder(orderId: string) {
  const response = await api.post<ApiResponse<CompleteOrderResult>>(`/orders/${orderId}/complete`);
  return response.data.data;
}

export async function failAppointment(orderId: string, data: FailAppointment) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/fail-appointment`,
    data,
  );
  return response.data.data;
}

export async function requireCorrection(orderId: string, data: RequireCorrection) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/require-correction`,
    data,
  );
  return response.data.data;
}
