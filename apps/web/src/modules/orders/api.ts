import type {
  AssignEquipment,
  CreateOrder,
  CreateUnit,
  FailedAppointmentResolution,
  OrderAdministrationDetail,
  OrderAdministrationEquipmentDetail,
  OrderAdministrationTechnician,
  OrderAdministrationUnitDetail,
  OrderChecklistDetail,
  OrderChecklistItemDetail,
  OrderEvidenceDetail,
  OrderExecutionDetail,
  OrderListQuery,
  OrderPricingOverrides,
  OrderServiceType,
  OrderSignatureDetail,
  OrderStatus,
  RescheduleFailedAppointment,
  UpdateOrder,
  UpdateUnit,
} from '@puk/contracts';
import { api, type ApiResponse } from '../../shared/http/client.js';
import { generateUuid } from '../../shared/utils/uuid.js';

export type { ApiResponse };

export type EquipmentItem = OrderAdministrationEquipmentDetail;
export type ChecklistEvidenceItem = OrderEvidenceDetail;
export type UnitChecklistItem = OrderChecklistItemDetail;
export type UnitChecklist = OrderChecklistDetail;
export type UnitItem = OrderAdministrationUnitDetail;
export type TechnicianPricing = OrderAdministrationTechnician;
export type SignatureItem = OrderSignatureDetail;
export type OrderDetail = OrderAdministrationDetail;

export interface OrderSummary {
  id: string;
  folio: string;
  status: OrderStatus;
  serviceType: OrderServiceType;
  clientNameSnapshot: string;
  scheduledAt: string;
  failedAppointmentResolution?: FailedAppointmentResolution | null;
  rescheduledOrder?: { id: string; folio: string; status: OrderStatus } | null;
  technician?: { id: string; name: string } | null;
  _count?: { units: number };
}

export interface SheetSyncOperation {
  id: string;
  operationType: string;
  status: 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED' | 'SUPERSEDED';
  attempts: number;
  payload?: { row?: number } | null;
  lastErrorMessage?: string | null;
  createdAt: string;
  scheduledFor?: string | null;
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

export async function fetchOrderExecutionById(id: string): Promise<OrderExecutionDetail> {
  const response = await api.get<ApiResponse<OrderExecutionDetail>>(`/orders/${id}/execution`);
  return response.data.data;
}

export async function createOrder(
  data: CreateOrder,
  idempotencyKey: string = generateUuid(),
): Promise<OrderDetail> {
  const response = await api.post<ApiResponse<OrderDetail>>('/orders', data, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data.data;
}

export async function updateOrder(id: string, data: UpdateOrder): Promise<OrderDetail> {
  const response = await api.patch<ApiResponse<OrderDetail>>(`/orders/${id}`, data);
  return response.data.data;
}

export async function updateOrderPricing(
  id: string,
  overrides: OrderPricingOverrides,
): Promise<OrderDetail> {
  const response = await api.patch<ApiResponse<OrderDetail>>(`/orders/${id}/pricing`, overrides);
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

export async function rescheduleFailedAppointment(
  id: string,
  data: RescheduleFailedAppointment,
): Promise<OrderDetail> {
  const response = await api.post<ApiResponse<OrderDetail>>(`/orders/${id}/reschedule`, data);
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
  operations: SheetSyncOperation[];
}> {
  const response = await api.get<
    ApiResponse<{
      isFullySynced: boolean;
      total: number;
      synced: number;
      failed: number;
      pending: number;
      operations: SheetSyncOperation[];
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

export async function fetchReportVersions(orderId: string): Promise<ServiceOrderReport[]> {
  const response = await api.get<ApiResponse<ServiceOrderReport[]>>(`/orders/${orderId}/reports`);
  return response.data.data;
}

export async function generateReport(orderId: string): Promise<ServiceOrderReport> {
  const response = await api.post<ApiResponse<ServiceOrderReport>>(
    `/orders/${orderId}/report/generate`,
  );
  return response.data.data;
}

export async function fetchReportDownload(
  orderId: string,
  version?: number,
): Promise<{
  url: string;
  expiresInSeconds: number;
  fileName: string;
}> {
  const path =
    version === undefined
      ? `/orders/${orderId}/report/file`
      : `/orders/${orderId}/reports/${version}/file`;
  const response = await api.get<Blob>(path, {
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'];
  const fileName =
    typeof disposition === 'string'
      ? (disposition.match(/filename="([^"]+)"/)?.[1] ?? 'service-order.pdf')
      : 'service-order.pdf';
  return { url: URL.createObjectURL(response.data), expiresInSeconds: 0, fileName };
}
