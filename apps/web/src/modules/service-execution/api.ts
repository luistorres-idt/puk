import type {
  CompleteEvidence,
  CompleteSignature,
  FailAppointment,
  MeOrderAccessResponse,
  PresignEvidence,
  PresignSignature,
  ReportDiscrepancy,
  RequireCorrection,
  SaveChecklistItem,
  UpdateExecutionNotes,
} from '@puk/contracts';
import { api, type ApiResponse } from '../../shared/http/client.js';
import { generateUuid } from '@/shared/utils/uuid.js';

export type { ApiResponse };

export interface CompleteOrderResult extends Record<string, unknown> {
  warnings?: string[];
}

let storageModePromise: Promise<'s3' | 'drive'> | undefined;
const pendingSignatureKeys = new Map<string, string>();

export function getStorageMode(): Promise<'s3' | 'drive'> {
  storageModePromise ??= api
    .get<ApiResponse<{ provider: 's3' | 'drive' }>>('/storage/mode')
    .then((response) => response.data.data.provider)
    .catch((error: unknown) => {
      storageModePromise = undefined;
      throw error;
    });
  return storageModePromise;
}

export function releasePrivateFileUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
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
  data: PresignEvidence,
) {
  const response = await api.post<
    ApiResponse<{ evidenceId: string; uploadUrl: string; objectKey: string }>
  >(`/orders/${orderId}/units/${unitId}/evidence/presign`, data);
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

export async function uploadEvidenceFile(
  orderId: string,
  unitId: string,
  blob: Blob,
  width: number,
  height: number,
  idempotencyKey: string,
) {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units/${unitId}/evidence/file`,
    blob,
    {
      headers: {
        'Content-Type': blob.type,
        'X-Image-Width': String(width),
        'X-Image-Height': String(height),
        'Idempotency-Key': idempotencyKey,
      },
    },
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
  if ((await getStorageMode()) === 'drive') {
    const response = await api.get<Blob>(`/evidence/${evidenceId}/file`, {
      responseType: 'blob',
    });
    return { downloadUrl: URL.createObjectURL(response.data) };
  }
  const response = await api.get<ApiResponse<{ downloadUrl: string }>>(
    `/evidence/${evidenceId}/url`,
  );
  return response.data.data;
}

export async function uploadSignatureFile(orderId: string, signerName: string, blob: Blob) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const checksum = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const retryKey = `puk:signature-upload:${orderId}:${signerName.trim()}:${checksum}`;
  let storedKey: string | null = null;
  try {
    storedKey = sessionStorage.getItem(retryKey);
  } catch {
    // Private browsing may disable session storage.
  }
  const idempotencyKey = pendingSignatureKeys.get(retryKey) ?? storedKey ?? generateUuid();
  pendingSignatureKeys.set(retryKey, idempotencyKey);
  try {
    sessionStorage.setItem(retryKey, idempotencyKey);
  } catch {
    // In-memory retries remain available.
  }
  const response = await api.put<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/signature/file`,
    blob,
    {
      headers: {
        'Content-Type': 'image/png',
        'X-Signer-Name': signerName,
        'Idempotency-Key': idempotencyKey,
      },
    },
  );
  pendingSignatureKeys.delete(retryKey);
  try {
    sessionStorage.removeItem(retryKey);
  } catch {
    // A private browsing session may not expose persistent storage.
  }
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
  if ((await getStorageMode()) === 'drive') {
    const response = await api.get<Blob>(`/orders/${orderId}/signature/file`, {
      responseType: 'blob',
    });
    const encodedSignerName = response.headers['x-signer-name'];
    let signerName = '';
    if (typeof encodedSignerName === 'string') {
      try {
        signerName = decodeURIComponent(encodedSignerName);
      } catch {
        signerName = '';
      }
    }
    return {
      downloadUrl: URL.createObjectURL(response.data),
      signerName,
    };
  }
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

export async function updateExecutionNotes(orderId: string, data: UpdateExecutionNotes) {
  const response = await api.patch<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/execution-notes`,
    data,
  );
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

export async function getMeOrderAccess(): Promise<MeOrderAccessResponse> {
  const response = await api.get<ApiResponse<MeOrderAccessResponse>>('/me/order-access');
  return response.data.data;
}
