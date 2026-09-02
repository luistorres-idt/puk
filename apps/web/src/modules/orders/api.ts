import type {
  AssignEquipment,
  CreateOrder,
  CreateUnit,
  OrderListQuery,
  UpdateOrder,
  UpdateUnit,
} from '@puk/contracts';
import { api } from '../../shared/http/client.js';

export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string;
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface EquipmentItem {
  id: string;
  externalKey: string;
  externalId?: string | null;
  imei?: string | null;
  brandSnapshot?: string | null;
  modelSnapshot?: string | null;
  equipmentConditionSnapshot?: string | null;
}

export interface UnitItem {
  id: string;
  label: string;
  makeModel: string;
  serialNumber: string;
  year?: number | null;
  status: string;
  equipment?: EquipmentItem[];
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

export async function fetchOrders(query: OrderListQuery = {}): Promise<ApiResponse<OrderSummary[]>> {
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
  const response = await api.post<ApiResponse<Record<string, unknown>>>(`/orders/${orderId}/units`, data);
  return response.data.data;
}

export async function updateUnit(orderId: string, unitId: string, data: UpdateUnit): Promise<Record<string, unknown>> {
  const response = await api.patch<ApiResponse<Record<string, unknown>>>(`/orders/${orderId}/units/${unitId}`, data);
  return response.data.data;
}

export async function deleteUnit(orderId: string, unitId: string): Promise<{ deleted: boolean }> {
  const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`/orders/${orderId}/units/${unitId}`);
  return response.data.data;
}

export async function assignEquipment(orderId: string, unitId: string, data: AssignEquipment): Promise<Record<string, unknown>> {
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
  const response = await api.get<ApiResponse<{
    isFullySynced: boolean;
    total: number;
    synced: number;
    failed: number;
    pending: number;
    operations: Array<Record<string, unknown>>;
  }>>(`/orders/${orderId}/sync`);
  return response.data.data;
}

export async function retrySync(orderId: string): Promise<{ retriedCount: number }> {
  const response = await api.post<ApiResponse<{ retriedCount: number }>>(`/orders/${orderId}/sync/retry`);
  return response.data.data;
}
