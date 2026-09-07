import type {
  AssignEquipment,
  ChecklistCategory,
  ChecklistCondition,
  CreateOrder,
  CreateUnit,
  OrderListQuery,
  UpdateOrder,
  UpdateUnit,
} from '@puk/contracts';
import { api, type ApiResponse } from '../../shared/http/client.js';

export type { ApiResponse };

export interface EquipmentItem {
  id: string;
  externalKey: string;
  externalId?: string | null;
  imei?: string | null;
  brandSnapshot?: string | null;
  modelSnapshot?: string | null;
  equipmentConditionSnapshot?: string | null;
  verificationStatus?: string | null;
}

export interface ChecklistEvidenceItem {
  id: string;
  objectKey: string;
  status: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number | null;
  height?: number | null;
  createdAt?: string;
}

export interface UnitChecklistItem {
  id: string;
  category: ChecklistCategory;
  condition?: ChecklistCondition | null;
  notes?: string | null;
  evidence?: ChecklistEvidenceItem[];
}

export interface UnitChecklist {
  id: string;
  items?: UnitChecklistItem[];
}

export interface UnitItem {
  id: string;
  label: string;
  makeModel: string;
  serialNumber: string;
  year?: number | null;
  status: string;
  equipment?: EquipmentItem[];
  checklist?: UnitChecklist | null;
}

export interface SignatureItem {
  id: string;
  orderId: string;
  signerName: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  signedAt: string;
  capturedById?: string;
}

export interface OrderDetail {
  id: string;
  folio: string;
  status: string;
  serviceType: string;
  clientNameSnapshot: string;
  clientSheetId: string;
  scheduledAt: string;
  isHomeService: boolean;
  serviceAddress?: string | null;
  generalNotes?: string | null;
  technician?: { id: string; name: string } | null;
  units?: UnitItem[];
  signature?: SignatureItem | null;
}

export interface OrderSummary {
  id: string;
  folio: string;
  status: string;
  serviceType: string;
  clientNameSnapshot: string;
  scheduledAt: string;
  technician?: { id: string; name: string } | null;
  _count?: { units: number };
}

export async function fetchOrders(
  query: OrderListQuery = {},
): Promise<ApiResponse<OrderSummary[]>> {
  const response = await api.get<ApiResponse<OrderSummary[]>>('/orders', {
    params: query,
  });
  return response.data;
}

export async function fetchOrderById(id: string): Promise<OrderDetail> {
  const response = await api.get<ApiResponse<OrderDetail>>(`/orders/${id}`);
  return response.data.data;
}

export async function createOrder(data: CreateOrder): Promise<OrderDetail> {
  const response = await api.post<ApiResponse<OrderDetail>>('/orders', data);
  return response.data.data;
}

export async function updateOrder(id: string, data: UpdateOrder): Promise<OrderDetail> {
  const response = await api.patch<ApiResponse<OrderDetail>>(`/orders/${id}`, data);
  return response.data.data;
}

export async function assignOrder(id: string): Promise<OrderDetail> {
  const response = await api.post<ApiResponse<OrderDetail>>(`/orders/${id}/assign`);
  return response.data.data;
}

export async function cancelOrder(id: string, reason?: string): Promise<OrderDetail> {
  const response = await api.post<ApiResponse<OrderDetail>>(`/orders/${id}/cancel`, { reason });
  return response.data.data;
}

export async function addUnit(orderId: string, data: CreateUnit): Promise<Record<string, unknown>> {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units`,
    data,
  );
  return response.data.data;
}

export async function updateUnit(
  orderId: string,
  unitId: string,
  data: UpdateUnit,
): Promise<Record<string, unknown>> {
  const response = await api.patch<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units/${unitId}`,
    data,
  );
  return response.data.data;
}

export async function deleteUnit(orderId: string, unitId: string): Promise<{ deleted: boolean }> {
  const response = await api.delete<ApiResponse<{ deleted: boolean }>>(
    `/orders/${orderId}/units/${unitId}`,
  );
  return response.data.data;
}

export async function assignEquipment(
  orderId: string,
  unitId: string,
  data: AssignEquipment,
): Promise<Record<string, unknown>> {
  const response = await api.post<ApiResponse<Record<string, unknown>>>(
    `/orders/${orderId}/units/${unitId}/equipment`,
    data,
  );
  return response.data.data;
}

export async function removeEquipment(
  orderId: string,
  unitId: string,
  equipmentId: string,
): Promise<{ removed: boolean }> {
  const response = await api.delete<ApiResponse<{ removed: boolean }>>(
    `/orders/${orderId}/units/${unitId}/equipment/${equipmentId}`,
  );
  return response.data.data;
}

export async function fetchSyncStatus(orderId: string): Promise<{
  isFullySynced: boolean;
  total: number;
  synced: number;
  failed: number;
  pending: number;
  operations: Array<Record<string, unknown>>;
}> {
  const response = await api.get<
    ApiResponse<{
      isFullySynced: boolean;
      total: number;
      synced: number;
      failed: number;
      pending: number;
      operations: Array<Record<string, unknown>>;
    }>
  >(`/orders/${orderId}/sync`);
  return response.data.data;
}

export async function retrySync(orderId: string): Promise<{ retriedCount: number }> {
  const response = await api.post<ApiResponse<{ retriedCount: number }>>(
    `/orders/${orderId}/sync/retry`,
  );
  return response.data.data;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId?: string | null;
  actor?: { id: string; name: string; email: string } | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

export async function fetchOrderAudit(orderId: string): Promise<AuditLogItem[]> {
  const response = await api.get<ApiResponse<AuditLogItem[]>>(`/orders/${orderId}/audit`);
  return response.data.data;
}

export interface ServiceOrderReport {
  id: string;
  orderId: string;
  version: number;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  sizeBytes?: number | null;
  checksum?: string | null;
  failureReason?: string | null;
  generatedAt?: string | null;
  createdAt: string;
}

export async function fetchCurrentReport(orderId: string): Promise<ServiceOrderReport | null> {
  const response = await api.get<ApiResponse<ServiceOrderReport | null>>(
    `/orders/${orderId}/report`,
  );
  return response.data.data;
}

export async function generateReport(orderId: string): Promise<ServiceOrderReport> {
  const response = await api.post<ApiResponse<ServiceOrderReport>>(
    `/orders/${orderId}/report/generate`,
  );
  return response.data.data;
}

export async function fetchReportDownload(orderId: string): Promise<{
  url: string;
  expiresInSeconds: number;
  fileName: string;
}> {
  const response = await api.get<
    ApiResponse<{ url: string; expiresInSeconds: number; fileName: string }>
  >(`/orders/${orderId}/report/download`);
  return response.data.data;
}
